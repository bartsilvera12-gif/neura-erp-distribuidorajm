import type { PoolClient } from "pg";
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { usuarioDelSchema } from "@/lib/repartos/server/repartos-pg";
import { alcanceRepartos } from "@/lib/usuarios/erp-rol-normalize";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Linea = { producto_id: string; cantidad: number };

function parseLineas(body: unknown): Linea[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { items?: unknown }).items;
  if (!Array.isArray(raw)) return null;

  // Sumadas por producto: mandar el mismo producto dos veces es legítimo desde
  // un formulario, y sumarlas evita dos movimientos por la misma cosa.
  const porProducto = new Map<string, number>();
  for (const it of raw) {
    if (!it || typeof it !== "object") return null;
    const o = it as Record<string, unknown>;
    const producto_id = String(o.producto_id ?? "").trim();
    const cantidad = Number(o.cantidad);
    if (!UUID_RE.test(producto_id)) return null;
    if (!Number.isFinite(cantidad) || cantidad < 0) return null;
    if (cantidad === 0) continue;
    porProducto.set(producto_id, (porProducto.get(producto_id) ?? 0) + cantidad);
  }
  return [...porProducto].map(([producto_id, cantidad]) => ({ producto_id, cantidad }));
}

/**
 * POST /api/repartos/[id]/movimientos — los dos documentos del ciclo móvil
 * (documento v0.2, pág. 4).
 *
 * Body: { tipo: "carga" | "transferencia", items: [{producto_id, cantidad}],
 *         destino_id?, referencia? }
 *
 * - `carga`: mercadería que entra al camión directamente en el proveedor.
 *   Sube el stock del camión y el total de la empresa.
 * - `transferencia`: el camión descarga parte en el salón o en un depósito.
 *   Baja el camión y sube el destino; el total de la empresa no cambia, porque
 *   la mercadería no entró ni salió, solo se movió.
 *
 * Las dos actualizan `reparto_stock.cantidad_inicial`, que es "todo lo que
 * estuvo arriba del camión durante la jornada": si no, una carga de media
 * mañana no aparecería en la rendición.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

  let client: PoolClient | null = null;
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const { id } = await context.params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json(errorResponse("Reparto inválido."), { status: 400 });
    }

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const tipo = String(body?.tipo ?? "").trim();
    if (tipo !== "carga" && tipo !== "transferencia") {
      return NextResponse.json(errorResponse("Tipo de movimiento inválido."), { status: 400 });
    }

    const lineas = parseLineas(body);
    if (lineas === null) {
      return NextResponse.json(errorResponse("Movimiento inválido: revisá las cantidades."), {
        status: 400,
      });
    }
    if (lineas.length === 0) {
      return NextResponse.json(errorResponse("Cargá al menos un producto."), { status: 400 });
    }

    const destinoId = String(body?.destino_id ?? "").trim();
    if (tipo === "transferencia" && !UUID_RE.test(destinoId)) {
      return NextResponse.json(errorResponse("Elegí a dónde va la mercadería."), { status: 400 });
    }
    const referencia = String(body?.referencia ?? "").trim() || null;

    const tR = quoteSchemaTable(schema, "repartos");
    const tC = quoteSchemaTable(schema, "camiones");
    const tP = quoteSchemaTable(schema, "productos");
    const tS = quoteSchemaTable(schema, "reparto_stock");
    const tSU = quoteSchemaTable(schema, "inventario_stock_ubicacion");
    const tU = quoteSchemaTable(schema, "inventario_ubicaciones");
    const tM = quoteSchemaTable(schema, "movimientos_inventario");

    client = await pool.connect();
    await client.query("BEGIN");

    // Alcance del rol: el vendedor móvil solo toca sus propios repartos. El
    // chequeo va en el servidor porque ocultar el botón no impide la llamada.
    const yo = await usuarioDelSchema({ schema, empresaId, email: ctx.auth.user.email });
    if (alcanceRepartos(yo?.rol) === "propios") {
      const dueno = await client.query<{ ok: number }>(
        `SELECT 1 AS ok FROM ${quoteSchemaTable(schema, "repartos")}
          WHERE id = $1::uuid AND empresa_id = $2::uuid AND repartidor_id = $3::uuid`,
        [id, empresaId, yo?.id ?? null]
      );
      if (dueno.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(errorResponse("Ese reparto no es tuyo."), { status: 403 });
      }
    }

    const repQ = await client.query<{
      estado: string;
      camion: string;
      ubicacion_id: string | null;
    }>(
      `SELECT r.estado, c.alias AS camion, c.ubicacion_id
         FROM ${tR} r JOIN ${tC} c ON c.id = r.camion_id
        WHERE r.id = $1::uuid AND r.empresa_id = $2::uuid
        FOR UPDATE OF r`,
      [id, empresaId]
    );
    if (repQ.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Reparto no encontrado."), { status: 404 });
    }
    if (repQ.rows[0].estado === "cerrado") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse("Ese reparto ya está cerrado: no se le puede mover mercadería."),
        { status: 409 }
      );
    }
    const origenUbic = repQ.rows[0].ubicacion_id;
    if (!origenUbic) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse(
          `El camión ${repQ.rows[0].camion} no tiene ubicación de inventario. Corré 09_stock_movil.sql.`
        ),
        { status: 409 }
      );
    }

    if (tipo === "transferencia") {
      if (destinoId === origenUbic) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          errorResponse("El destino no puede ser el mismo camión."),
          { status: 400 }
        );
      }
      const destQ = await client.query<{ ok: number }>(
        `SELECT 1 AS ok FROM ${tU}
          WHERE id = $1::uuid AND empresa_id = $2::uuid AND activo = true`,
        [destinoId, empresaId]
      );
      if (destQ.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(errorResponse("Ese destino no existe o está inactivo."), {
          status: 400,
        });
      }
    }

    const prodQ = await client.query<{
      id: string;
      nombre: string;
      sku: string;
      unidad_medida: string | null;
    }>(
      `SELECT id, nombre, sku, unidad_medida FROM ${tP}
        WHERE empresa_id = $1::uuid AND id = ANY($2::uuid[])`,
      [empresaId, lineas.map((l) => l.producto_id)]
    );
    if (prodQ.rows.length !== lineas.length) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse("Hay productos que no pertenecen a esta empresa."),
        { status: 400 }
      );
    }
    const productos = new Map(prodQ.rows.map((p) => [p.id, p]));

    const fechaIso = new Date().toISOString();
    const signoCamion = tipo === "carga" ? 1 : -1;

    for (const l of lineas) {
      const p = productos.get(l.producto_id)!;

      // Una transferencia no puede sacar del camión más de lo que hay: el saldo
      // quedaría negativo y la rendición arrancaría descuadrada.
      if (tipo === "transferencia") {
        const hayQ = await client.query<{ stock: string }>(
          `SELECT COALESCE(stock_actual, 0)::text AS stock FROM ${tSU}
            WHERE empresa_id = $1::uuid AND producto_id = $2::uuid AND ubicacion_id = $3::uuid
            FOR UPDATE`,
          [empresaId, l.producto_id, origenUbic]
        );
        const hay = Number(hayQ.rows[0]?.stock ?? 0);
        if (hay < l.cantidad) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            errorResponse(
              `No hay tanto ${p.nombre} en el camión ${repQ.rows[0].camion}: hay ${hay} y querés mover ${l.cantidad}.`
            ),
            { status: 409 }
          );
        }
      }

      await client.query(
        `INSERT INTO ${tSU} (empresa_id, producto_id, ubicacion_id, stock_actual)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
         ON CONFLICT (empresa_id, producto_id, ubicacion_id)
         DO UPDATE SET stock_actual = ${tSU}.stock_actual + EXCLUDED.stock_actual,
                       updated_at = now()`,
        [empresaId, l.producto_id, origenUbic, signoCamion * l.cantidad]
      );

      await client.query(
        `INSERT INTO ${tM} (
           empresa_id, producto_id, producto_nombre, producto_sku,
           tipo, cantidad, origen, referencia, fecha, ubicacion_id
         ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::uuid)`,
        [
          empresaId,
          l.producto_id,
          p.nombre,
          p.sku,
          tipo === "carga" ? "ENTRADA" : "SALIDA",
          l.cantidad,
          tipo === "carga" ? "carga_proveedor" : "transferencia",
          referencia ?? (tipo === "carga" ? "Carga de proveedor" : "Transferencia desde camión"),
          fechaIso,
          origenUbic,
        ]
      );

      if (tipo === "carga") {
        // Entra mercadería nueva a la empresa: sube el total global.
        await client.query(
          `UPDATE ${tP} SET stock_actual = stock_actual + $1, updated_at = now()
            WHERE id = $2::uuid AND empresa_id = $3::uuid`,
          [l.cantidad, l.producto_id, empresaId]
        );
      } else {
        // La mercadería solo cambia de lugar: el destino sube lo que bajó el
        // camión y el total de la empresa queda igual.
        await client.query(
          `INSERT INTO ${tSU} (empresa_id, producto_id, ubicacion_id, stock_actual)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
           ON CONFLICT (empresa_id, producto_id, ubicacion_id)
           DO UPDATE SET stock_actual = ${tSU}.stock_actual + EXCLUDED.stock_actual,
                         updated_at = now()`,
          [empresaId, l.producto_id, destinoId, l.cantidad]
        );
        await client.query(
          `INSERT INTO ${tM} (
             empresa_id, producto_id, producto_nombre, producto_sku,
             tipo, cantidad, origen, referencia, fecha, ubicacion_id
           ) VALUES ($1::uuid, $2::uuid, $3, $4, 'ENTRADA', $5, 'transferencia', $6, $7::timestamptz, $8::uuid)`,
          [
            empresaId,
            l.producto_id,
            p.nombre,
            p.sku,
            l.cantidad,
            referencia ?? `Transferencia desde camión ${repQ.rows[0].camion}`,
            fechaIso,
            destinoId,
          ]
        );
      }

      // Lo que estuvo arriba del camión durante la jornada. Una carga de media
      // mañana tiene que aparecer en la rendición; una transferencia al salón
      // ya no vuelve, así que tampoco debe esperarse de vuelta.
      await client.query(
        `INSERT INTO ${tS} (empresa_id, reparto_id, producto_id, unidad_medida, cantidad_inicial)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, GREATEST($5, 0))
         ON CONFLICT (reparto_id, producto_id)
         DO UPDATE SET cantidad_inicial = GREATEST(${tS}.cantidad_inicial + $5, 0),
                       updated_at = now()`,
        [
          empresaId,
          id,
          l.producto_id,
          p.unidad_medida || "Unidad",
          signoCamion * l.cantidad,
        ]
      );
    }

    await client.query("COMMIT");
    return NextResponse.json(successResponse({ reparto_id: id, tipo, lineas: lineas.length }));
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[/api/repartos/[id]/movimientos POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo registrar el movimiento."), { status: 500 });
  } finally {
    client?.release();
  }
}
