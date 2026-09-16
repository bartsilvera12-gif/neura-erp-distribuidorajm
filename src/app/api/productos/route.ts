import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  insertProducto,
  insertMovimientoInicial,
  rowToProductoApi,
  DuplicadoError,
} from "@/lib/inventario/server/productos-pg";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { normalizeUpperText, normalizeUpperCodigoBarras } from "@/lib/text/normalize";
import { signProductoImagen } from "@/lib/inventario/imagen-storage";
import { usuarioDelSchema } from "@/lib/repartos/server/repartos-pg";

/**
 * Ubicación de inventario del camión de un reparto.
 *
 * Devuelve `null` si el reparto no existe, no es de esta empresa o su camión
 * todavía no tiene ubicación: en todos esos casos se cae al stock global en vez
 * de dejar la lista vacía sin explicación.
 */
async function ubicacionDelReparto(
  pool: NonNullable<ReturnType<typeof getChatPostgresPool>>,
  schema: string,
  empresaId: string,
  repartoId: string
): Promise<string | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(repartoId)) return null;
  const existe = await queryWithRetry<{ r: string | null; c: string | null; s: string | null }>(
    pool,
    `SELECT to_regclass($1)::text AS r, to_regclass($2)::text AS c, to_regclass($3)::text AS s`,
    [`${schema}.repartos`, `${schema}.camiones`, `${schema}.inventario_stock_ubicacion`]
  );
  const e = existe.rows[0];
  if (!e?.r || !e?.c || !e?.s) return null;

  const q = await queryWithRetry<{ ubicacion_id: string | null }>(
    pool,
    `SELECT c.ubicacion_id
       FROM ${quoteSchemaTable(schema, "repartos")} r
       JOIN ${quoteSchemaTable(schema, "camiones")} c ON c.id = r.camion_id
      WHERE r.id = $1::uuid AND r.empresa_id = $2::uuid`,
    [repartoId, empresaId]
  );
  return q.rows[0]?.ubicacion_id ?? null;
}

/**
 * Ubicación del camión asignado a este usuario, si tiene uno.
 *
 * `null` cuando no hay camión suyo (un administrador vendiendo de mostrador) o
 * cuando falta la columna de la migración 13: en los dos casos el catálogo
 * vuelve a ser el stock general, que es lo correcto ahí.
 */
async function ubicacionDeMiCamion(
  pool: NonNullable<ReturnType<typeof getChatPostgresPool>>,
  schema: string,
  empresaId: string,
  usuarioId: string
): Promise<string | null> {
  const cols = await queryWithRetry<{ c: string }>(
    pool,
    `SELECT column_name AS c FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'camiones' AND column_name = 'repartidor_id'`,
    [schema]
  );
  if (cols.rows.length === 0) return null;
  const q = await queryWithRetry<{ ubicacion_id: string | null }>(
    pool,
    `SELECT ubicacion_id FROM ${quoteSchemaTable(schema, "camiones")}
      WHERE empresa_id = $1::uuid AND repartidor_id = $2::uuid AND activo = true
      LIMIT 1`,
    [empresaId, usuarioId]
  );
  return q.rows[0]?.ubicacion_id ?? null;
}

/**
 * GET /api/productos — lista los productos activos via PG directo
 * (soporta tenants erp_* no expuestos por PostgREST).
 *
 * Con `?reparto_id=` devuelve solo lo que hay arriba de ese camión, con la
 * cantidad de esa ubicación en `stock_actual`.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const empresaId = ctx.auth.empresa_id;
    const schemaRaw = await fetchDataSchemaForEmpresaId(empresaId);
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const pool = getChatPostgresPool();
    if (!pool) {
      return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });
    }
    const t = quoteSchemaTable(schema, "productos");

    // `reparto_id` cambia de qué stock se habla. Sin él, el stock global de la
    // empresa; con él, lo que hay arriba de ESE camión, que es lo único que el
    // vendedor puede vender en la calle. Ofrecerle un producto que está en el
    // depósito termina en una venta que el control de mercadería no puede
    // explicar.
    const repartoId = request.nextUrl.searchParams.get("reparto_id")?.trim() ?? "";
    let ubicacionId = repartoId ? await ubicacionDelReparto(pool, schema, empresaId, repartoId) : null;

    // Sin reparto todavía —la primera venta del día— el catálogo igual tiene que
    // ser el del camión de quien vende. Si no, la primera venta de la mañana se
    // hace contra el stock del depósito y sale mercadería que nunca subió.
    if (ubicacionId === null) {
      const yo = await usuarioDelSchema({ schema, empresaId, email: ctx.auth.user?.email });
      if (yo) ubicacionId = await ubicacionDeMiCamion(pool, schema, empresaId, yo.id);
    }

    const sql =
      ubicacionId === null
        ? `SELECT id, empresa_id, nombre, sku, costo_promedio, precio_venta, stock_actual, stock_minimo,
                  unidad_medida, metodo_valuacion, activo, created_at, updated_at,
                  codigo_barras, codigo_barras_interno, imagen_path, imagen_url,
                  categoria_principal_id, ubicacion_principal_id, proveedor_principal_id
             FROM ${t}
            WHERE empresa_id = $1::uuid AND activo = true
            ORDER BY nombre`
        : `SELECT p.id, p.empresa_id, p.nombre, p.sku, p.costo_promedio, p.precio_venta,
                  COALESCE(su.stock_actual, 0) AS stock_actual,
                  p.stock_minimo, p.unidad_medida, p.metodo_valuacion, p.activo,
                  p.created_at, p.updated_at, p.codigo_barras, p.codigo_barras_interno,
                  p.imagen_path, p.imagen_url, p.categoria_principal_id,
                  p.ubicacion_principal_id, p.proveedor_principal_id
             FROM ${t} p
             JOIN ${quoteSchemaTable(schema, "inventario_stock_ubicacion")} su
               ON su.producto_id = p.id AND su.ubicacion_id = $2::uuid
            WHERE p.empresa_id = $1::uuid AND p.activo = true AND su.stock_actual > 0
            ORDER BY p.nombre`;

    const { rows } = await queryWithRetry(
      pool,
      sql,
      ubicacionId === null ? [empresaId] : [empresaId, ubicacionId]
    );
    // La imagen vive en un bucket privado y se mira con una URL firmada que
    // dura una hora. La columna `imagen_url` de la tabla queda siempre en NULL
    // a propósito (una URL vencida guardada en la base es una imagen rota), así
    // que la firma se genera acá, en cada lectura, a partir de `imagen_path`.
    const firmadas = await Promise.all(
      rows.map((r) =>
        r.imagen_path ? signProductoImagen(ctx.supabase, r.imagen_path, 3600) : null
      )
    );
    const productos = rows.map((r, i) => ({ ...r, imagen_url: firmadas[i] ?? null }));

    return NextResponse.json(successResponse({ productos }));
  } catch (err) {
    console.error("[/api/productos GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los productos."), { status: 500 });
  }
}
import {
  setCategoriaPrincipal,
  setStockUbicacionInicial,
} from "@/lib/inventario/server/catalogos-pg";

/** Valida que un id existe en la tabla indicada para la empresa. Devuelve true si OK, false si no. */
async function existsInTenant(
  schema: string,
  empresaId: string,
  table: "categorias_productos" | "inventario_ubicaciones" | "proveedores",
  id: string
): Promise<boolean> {
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Pool no disponible.");
  const s = assertAllowedChatDataSchema(schema);
  const t = quoteSchemaTable(s, table);
  const { rows } = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok FROM ${t} WHERE id = $1::uuid AND empresa_id = $2::uuid LIMIT 1`,
    [id, empresaId]
  );
  return rows.length > 0;
}

/**
 * POST /api/productos
 *
 * Alta server-side via PG directo (soporta tenants `erp_*` NO expuestos por
 * PostgREST, evita PGRST106 "Invalid schema"). Si stock_actual > 0, graba
 * movimiento de inventario_inicial en el mismo handler.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const empresaId = ctx.auth.empresa_id;
    const schema = await fetchDataSchemaForEmpresaId(empresaId);

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }

    const nombre = normalizeUpperText(body.nombre);
    const sku = normalizeUpperText(body.sku);
    if (!nombre) return NextResponse.json(errorResponse("El nombre es obligatorio."), { status: 400 });
    if (!sku) return NextResponse.json(errorResponse("El SKU es obligatorio."), { status: 400 });

    const codigoBarras = normalizeUpperCodigoBarras(body.codigo_barras);
    const codigoBarrasInterno = codigoBarras != null && body.codigo_barras_interno === true;
    const stockActual = Number(body.stock_actual ?? 0) || 0;
    const costoPromedio = Number(body.costo_promedio ?? 0) || 0;
    const stockMinimo = Number(body.stock_minimo ?? 0) || 0;
    const precioVenta = Number(body.precio_venta ?? 0) || 0;
    const unidadMedida = normalizeUpperText(body.unidad_medida) || "UNIDAD";
    const metodoValuacion =
      body.metodo_valuacion === "FIFO" || body.metodo_valuacion === "LIFO"
        ? (body.metodo_valuacion as "FIFO" | "LIFO")
        : "CPP";

    // Relaciones opcionales — validar ownership en mismo tenant
    const categoriaPrincipalId = body.categoria_principal_id ? String(body.categoria_principal_id) : null;
    const ubicacionPrincipalId = body.ubicacion_principal_id ? String(body.ubicacion_principal_id) : null;
    const proveedorPrincipalId = body.proveedor_principal_id ? String(body.proveedor_principal_id) : null;

    if (categoriaPrincipalId && !(await existsInTenant(schema, empresaId, "categorias_productos", categoriaPrincipalId))) {
      return NextResponse.json(errorResponse("La categoría seleccionada no existe."), { status: 400 });
    }
    if (ubicacionPrincipalId && !(await existsInTenant(schema, empresaId, "inventario_ubicaciones", ubicacionPrincipalId))) {
      return NextResponse.json(errorResponse("La ubicación seleccionada no existe."), { status: 400 });
    }
    if (proveedorPrincipalId && !(await existsInTenant(schema, empresaId, "proveedores", proveedorPrincipalId))) {
      return NextResponse.json(errorResponse("El proveedor seleccionado no existe."), { status: 400 });
    }

    try {
      const row = await insertProducto(schema, empresaId, {
        nombre,
        sku,
        costo_promedio: costoPromedio,
        precio_venta: precioVenta,
        stock_actual: stockActual,
        stock_minimo: stockMinimo,
        unidad_medida: unidadMedida,
        metodo_valuacion: metodoValuacion,
        codigo_barras: codigoBarras,
        codigo_barras_interno: codigoBarrasInterno,
        categoria_principal_id: categoriaPrincipalId,
        ubicacion_principal_id: ubicacionPrincipalId,
        proveedor_principal_id: proveedorPrincipalId,
      });

      // Inventario inicial (mismo schema, via PG directo).
      // Si falla aqui, el producto YA fue creado — registramos el error en
      // logs y devolvemos warning al cliente, pero no perdemos el producto.
      let movWarning: string | null = null;
      if (stockActual > 0) {
        try {
          await insertMovimientoInicial(schema, empresaId, {
            producto_id: row.id,
            producto_nombre: row.nombre,
            producto_sku: row.sku,
            cantidad: stockActual,
            costo_unitario: costoPromedio,
            created_by: ctx.auth.usuarioCatalogId ?? null,
            usuario_nombre: ctx.auth.user?.email ?? null,
          });
        } catch (movErr) {
          const message = movErr instanceof Error ? movErr.message : String(movErr);
          console.error("[/api/productos] inventario_inicial fallo", {
            schema,
            empresaId,
            productoId: row.id,
            message,
            code: (movErr as { code?: string })?.code,
            detail: (movErr as { detail?: string })?.detail,
            constraint: (movErr as { constraint?: string })?.constraint,
          });
          movWarning = "El producto se guardó pero no se pudo registrar el movimiento inicial de stock. Avisá al equipo técnico.";
        }
      }

      // Categoria principal: tambien insertar en puente producto_categorias.
      if (categoriaPrincipalId) {
        try {
          await setCategoriaPrincipal(schema, empresaId, row.id, categoriaPrincipalId);
        } catch (err) {
          console.error("[/api/productos] setCategoriaPrincipal fallo", {
            schema, empresaId, productoId: row.id,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Stock inicial por ubicacion (no reemplaza productos.stock_actual).
      if (ubicacionPrincipalId && stockActual > 0) {
        try {
          await setStockUbicacionInicial(schema, empresaId, row.id, ubicacionPrincipalId, stockActual);
        } catch (err) {
          console.error("[/api/productos] setStockUbicacionInicial fallo", {
            schema, empresaId, productoId: row.id,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return NextResponse.json(
        successResponse({ producto: rowToProductoApi(row), warning: movWarning })
      );
    } catch (err) {
      if (err instanceof DuplicadoError) {
        return NextResponse.json(errorResponse(err.message), { status: 409 });
      }
      console.error("[/api/productos POST]", {
        schema,
        empresaId,
        message: err instanceof Error ? err.message : String(err),
        code: (err as { code?: string })?.code,
      });
      return NextResponse.json(
        errorResponse("No se pudo guardar el producto. Revisá los datos e intentá nuevamente."),
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("[/api/productos POST] outer", err instanceof Error ? err.message : err);
    return NextResponse.json(
      errorResponse("No se pudo guardar el producto. Revisá los datos e intentá nuevamente."),
      { status: 500 }
    );
  }
}
