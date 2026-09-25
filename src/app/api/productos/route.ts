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
import { conMotivo, motivoDelError } from "@/lib/api/motivo-error";
import { esRolAdminEmpresa } from "@/lib/modulos/resolve-effective-modules";
import type { OrigenCatalogo } from "@/lib/inventario/storage";

/**
 * El camión de un reparto y su ubicación de inventario.
 *
 * Devuelve también el nombre y si el reparto existe, porque la respuesta le
 * tiene que decir a la pantalla de qué está hablando. Antes esto devolvía
 * `null` para tres situaciones distintas —reparto inexistente, camión sin
 * ubicación, tablas que faltan— y las tres terminaban mostrando el inventario
 * entero como si fuera la carga del camión.
 */
type CamionDelReparto = {
  ubicacion_id: string | null;
  camion: string | null;
  existe: boolean;
};

async function camionDelReparto(
  pool: NonNullable<ReturnType<typeof getChatPostgresPool>>,
  schema: string,
  empresaId: string,
  repartoId: string
): Promise<CamionDelReparto> {
  const vacio: CamionDelReparto = { ubicacion_id: null, camion: null, existe: false };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(repartoId)) return vacio;
  const existe = await queryWithRetry<{ r: string | null; c: string | null; s: string | null }>(
    pool,
    `SELECT to_regclass($1)::text AS r, to_regclass($2)::text AS c, to_regclass($3)::text AS s`,
    [`${schema}.repartos`, `${schema}.camiones`, `${schema}.inventario_stock_ubicacion`]
  );
  const e = existe.rows[0];
  if (!e?.r || !e?.c || !e?.s) return vacio;

  const q = await queryWithRetry<{ ubicacion_id: string | null; nombre: string | null }>(
    pool,
    `SELECT c.ubicacion_id, c.nombre
       FROM ${quoteSchemaTable(schema, "repartos")} r
       JOIN ${quoteSchemaTable(schema, "camiones")} c ON c.id = r.camion_id
      WHERE r.id = $1::uuid AND r.empresa_id = $2::uuid`,
    [repartoId, empresaId]
  );
  const row = q.rows[0];
  if (!row) return vacio;
  return { ubicacion_id: row.ubicacion_id, camion: row.nombre, existe: true };
}

/**
 * Camión del reparto que este usuario tiene ABIERTO ahora.
 *
 * Es el hecho real de "este vendedor está en la calle con este camión", y no
 * depende de que alguien haya cargado `camiones.repartidor_id`: ese campo es la
 * asignación fija, que puede estar vacía aunque el reparto esté abierto y
 * cargado. Cuando lo estaba, el catálogo caía al salón —vacío, porque la
 * mercadería estaba arriba del camión— y el vendedor no podía vender nada.
 *
 * Con más de uno abierto no se elige por él: devuelve vacío para que la
 * pantalla pregunte de cuál vende.
 */
async function misRepartosAbiertos(
  pool: NonNullable<ReturnType<typeof getChatPostgresPool>>,
  schema: string,
  empresaId: string,
  email: string | null | undefined,
  usuarioCatalogId: string | null
): Promise<{ camiones: CamionDelReparto[]; usuarioEncontrado: boolean; rol: string | null }> {
  const nada = { camiones: [] as CamionDelReparto[], usuarioEncontrado: false, rol: null };
  const existe = await queryWithRetry<{ r: string | null; c: string | null; u: string | null }>(
    pool,
    `SELECT to_regclass($1)::text AS r, to_regclass($2)::text AS c, to_regclass($3)::text AS u`,
    [`${schema}.repartos`, `${schema}.camiones`, `${schema}.usuarios`]
  );
  const e = existe.rows[0];
  if (!e?.r || !e?.c || !e?.u) return nada;

  // Las columnas de `usuarios` varían entre schemas —hay bases heredadas sin
  // `rol` o sin `email`—, así que se piden las que estén. Nombrar una que no
  // existe no devuelve vacío: rompe la consulta entera con un 42703, y como
  // esto corre dentro del catálogo, se llevaba puesta toda la lista de
  // productos. Es el mismo cuidado que ya tenía el listado de repartidores.
  const colsQ = await queryWithRetry<{ columna: string }>(
    pool,
    `SELECT column_name AS columna FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'usuarios'`,
    [schema]
  );
  const cols = new Set(colsQ.rows.map((r) => r.columna));
  const hayEmail = cols.has("email");
  const hayRol = cols.has("rol");

  const condiciones: string[] = [];
  if (hayEmail) {
    condiciones.push(`($2::text IS NOT NULL AND lower(btrim(email)) = lower(btrim($2::text)))`);
  }
  condiciones.push(`($3::uuid IS NOT NULL AND id = $3::uuid)`);

  const yo = await queryWithRetry<{ id: string; rol: string | null }>(
    pool,
    `SELECT id, ${hayRol ? "rol" : "NULL::text AS rol"} FROM ${quoteSchemaTable(schema, "usuarios")}
      WHERE empresa_id = $1::uuid AND ( ${condiciones.join(" OR ")} )
      LIMIT 1`,
    [empresaId, email ?? null, usuarioCatalogId ?? null]
  );
  const row = yo.rows[0];
  if (!row) return nada;

  const q = await queryWithRetry<{ ubicacion_id: string | null; nombre: string | null }>(
    pool,
    `SELECT c.ubicacion_id, c.nombre
       FROM ${quoteSchemaTable(schema, "repartos")} r
       JOIN ${quoteSchemaTable(schema, "camiones")} c ON c.id = r.camion_id
      WHERE r.empresa_id = $1::uuid AND r.repartidor_id = $2::uuid AND r.estado = 'abierto'`,
    [empresaId, row.id]
  );
  return {
    camiones: q.rows.map((x) => ({ ubicacion_id: x.ubicacion_id, camion: x.nombre, existe: true })),
    usuarioEncontrado: true,
    rol: row.rol,
  };
}

/**
 * Ubicación del camión asignado a este usuario, si tiene uno.
 *
 * `null` cuando no hay camión suyo (un administrador vendiendo de mostrador) o
 * cuando falta la columna de la migración 13: en los dos casos el catálogo
 * vuelve a ser el stock general, que es lo correcto ahí.
 */
async function miCamion(
  pool: NonNullable<ReturnType<typeof getChatPostgresPool>>,
  schema: string,
  empresaId: string,
  usuarioId: string
): Promise<CamionDelReparto> {
  const vacio: CamionDelReparto = { ubicacion_id: null, camion: null, existe: false };
  const cols = await queryWithRetry<{ c: string }>(
    pool,
    `SELECT column_name AS c FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'camiones' AND column_name = 'repartidor_id'`,
    [schema]
  );
  if (cols.rows.length === 0) return vacio;
  const q = await queryWithRetry<{ ubicacion_id: string | null; nombre: string | null }>(
    pool,
    `SELECT ubicacion_id, nombre FROM ${quoteSchemaTable(schema, "camiones")}
      WHERE empresa_id = $1::uuid AND repartidor_id = $2::uuid AND activo = true
      LIMIT 1`,
    [empresaId, usuarioId]
  );
  const row = q.rows[0];
  if (!row) return vacio;
  return { ubicacion_id: row.ubicacion_id, camion: row.nombre, existe: true };
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
    // `para=venta` marca que la lista es para vender. SOLO ahí se acota al
    // camión o al salón.
    //
    // Inventario pide la misma lista y es otra cosa: es el maestro de productos
    // de la empresa. Acotarlo al camión le escondía productos —y con un camión
    // sin ubicación de inventario se la dejaba vacía, que se leía como que el
    // alta no había guardado nada—.
    const paraVenta = request.nextUrl.searchParams.get("para") === "venta";
    const repartoId = request.nextUrl.searchParams.get("reparto_id")?.trim() ?? "";

    let camion: CamionDelReparto = { ubicacion_id: null, camion: null, existe: false };
    let motivoSalon: OrigenCatalogo["motivo_salon"];
    let errorCamion: string | null = null;
    if (paraVenta) {
      if (repartoId) camion = await camionDelReparto(pool, schema, empresaId, repartoId);

      // Sin reparto todavía —la primera venta del día— el catálogo igual tiene
      // que ser el del camión de quien vende. Si no, la primera venta de la
      // mañana se hace contra el stock del depósito y sale mercadería que nunca
      // subió.
      //
      // SOLO para el vendedor móvil, que es el que vende de su camión. El
      // administrador y el cajero venden del salón aunque figuren como
      // repartidores de algún camión: sin este filtro, al admin que se asignó
      // un camión para probar se le acotaba la caja a ese camión y se quedaba
      // sin catálogo. Es la misma regla que aplica la pantalla (`useCajaVenta`);
      // acá faltaba, así que las dos podían no coincidir.
      if (!camion.existe) {
        // Resolver el camión es un agregado: si falla, la caja tiene que
        // seguir mostrando productos. Antes un error acá devolvía 500 y el
        // vendedor veía la lista vacía sin saber que la consulta se cayó.
        try {
        const mio = await misRepartosAbiertos(
          pool,
          schema,
          empresaId,
          ctx.auth.user?.email,
          ctx.auth.usuarioCatalogId ?? null
        );
        // Tener un reparto ABIERTO a tu nombre es el hecho más fuerte que hay:
        // significa que saliste con ese camión. Antes se exigía además que el
        // `rol` dijera "vendedor_movil", y ese campo puede estar vacío o
        // escrito distinto en bases heredadas —incluso faltar la columna—, con
        // lo cual un vendedor con el camión cargado terminaba viendo el salón
        // entero. Ahora el rol solo sirve para lo que hace falta: dejar afuera
        // al administrador, que vende de mostrador aunque figure en un reparto.
        const esAdmin = esRolAdminEmpresa(mio.rol);
        if (!mio.usuarioEncontrado) {
          motivoSalon = "usuario_no_encontrado";
        } else if (esAdmin) {
          motivoSalon = "rol_no_es_vendedor_movil";
        } else if (mio.camiones.length === 1) {
          camion = mio.camiones[0];
        } else {
          motivoSalon =
            mio.camiones.length === 0 ? "sin_reparto_abierto" : "varios_repartos_abiertos";
          // El camión asignado queda de respaldo por si el reparto no se abrió.
          const yo = await usuarioDelSchema({ schema, empresaId, email: ctx.auth.user?.email });
          if (yo) camion = await miCamion(pool, schema, empresaId, yo.id);
          if (camion.existe) motivoSalon = undefined;
        }
        } catch (e) {
          console.error("[/api/productos] resolviendo camión del vendedor:", e);
          errorCamion = motivoDelError(e) || "no se pudo resolver tu camión";
        }
      }
    }

    // Cuando hay un camión de por medio, el catálogo es el suyo y punto. Si no
    // se le pudo resolver la ubicación, la lista va VACÍA con el motivo: caer al
    // stock de la empresa dejaba al repartidor vendiendo lo que está en el
    // depósito, con el camión descargado, y eso no hay control de mercadería que
    // lo explique después.
    const ubicacionId = camion.ubicacion_id;
    const camionSinUbicacion = camion.existe && camion.ubicacion_id === null;

    // De dónde sale la lista. Viaja en la respuesta porque hasta ahora cada
    // pantalla lo suponía por su cuenta y podía decir "salón" mostrando el
    // camión, o al revés.
    const origen = camionSinUbicacion
      ? { tipo: "camion_sin_ubicacion" as const, camion: camion.camion }
      : ubicacionId
        ? { tipo: "camion" as const, camion: camion.camion }
        : paraVenta
          ? {
              tipo: "salon" as const,
              camion: null,
              motivo_salon: motivoSalon,
              error_camion: errorCamion,
            }
          : { tipo: "empresa" as const, camion: null };

    // Stock del salón: el total de la empresa menos lo que está arriba de los
    // camiones. Desde el mostrador no se puede vender mercadería que está
    // viajando, y mostrarla llevaba a prometer lo que no hay.
    //
    // Se resta en vez de sumar las ubicaciones fijas a propósito: una empresa
    // que todavía no lleva el depósito por ubicación no tiene filas ahí, y
    // sumarlas daría cero en todo. Restando, el peor caso es el total de la
    // empresa, que es como estaba antes.
    const sqlSalon = `
      WITH en_camiones AS (
        SELECT su.producto_id, sum(su.stock_actual) AS cantidad
          FROM ${quoteSchemaTable(schema, "inventario_stock_ubicacion")} su
          JOIN ${quoteSchemaTable(schema, "inventario_ubicaciones")} u
            ON u.id = su.ubicacion_id
         WHERE su.empresa_id = $1::uuid AND lower(btrim(COALESCE(u.tipo, ''))) = 'camion'
         GROUP BY su.producto_id
      )
      SELECT p.id, p.empresa_id, p.nombre, p.sku, p.costo_promedio, p.precio_venta,
             GREATEST(COALESCE(p.stock_actual, 0) - COALESCE(ec.cantidad, 0), 0) AS stock_actual,
             p.stock_minimo, p.unidad_medida, p.metodo_valuacion, p.activo,
             p.created_at, p.updated_at, p.codigo_barras, p.codigo_barras_interno,
             p.imagen_path, p.imagen_url, p.categoria_principal_id,
             p.ubicacion_principal_id, p.proveedor_principal_id
        FROM ${t} p
        LEFT JOIN en_camiones ec ON ec.producto_id = p.id
       WHERE p.empresa_id = $1::uuid AND p.activo = true
       ORDER BY p.nombre`;

    // Sin las tablas de ubicación no hay camiones que descontar: el stock de la
    // empresa es todo lo que hay, y es lo que se ofrece.
    const hayUbicaciones = await queryWithRetry<{ su: string | null; u: string | null }>(
      pool,
      `SELECT to_regclass($1)::text AS su, to_regclass($2)::text AS u`,
      [`${schema}.inventario_stock_ubicacion`, `${schema}.inventario_ubicaciones`]
    );
    const puedeDescontarCamiones =
      hayUbicaciones.rows[0]?.su !== null && hayUbicaciones.rows[0]?.u !== null;

    const sql =
      ubicacionId === null
        ? puedeDescontarCamiones && paraVenta
          ? sqlSalon
          : `SELECT id, empresa_id, nombre, sku, costo_promedio, precio_venta, stock_actual, stock_minimo,
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

    const { rows } = camionSinUbicacion
      ? { rows: [] as Record<string, unknown>[] }
      : await queryWithRetry(
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

    return NextResponse.json(successResponse({ productos, origen }));
  } catch (err) {
    console.error("[/api/productos GET]", err instanceof Error ? err.message : err);
    // Con el motivo real: "No se pudieron cargar los productos" a secas obliga a
    // mirar los logs del servidor, que quien está vendiendo no tiene.
    return NextResponse.json(
      errorResponse(conMotivo("No se pudieron cargar los productos", err)),
      { status: 500 }
    );
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
