import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const runtime = "nodejs";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TZ = "America/Asuncion";

/**
 * GET /api/reportes/ranking-camion?desde=&hasta=&camion_id=
 * Ranking de productos (cantidad e importe) y de clientes (cantidad de ventas
 * y total) de las ventas hechas desde camiones. Sin `camion_id` suma todos los
 * camiones. Las ventas anuladas no cuentan.
 *
 * Una venta es de un camión si descontó mercadería de su ubicación (movimiento
 * de inventario con origen "venta" y el N° de control como referencia): la
 * misma fuente que usa el inventario del camión.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión a la base."), { status: 503 });
    const sp = request.nextUrl.searchParams;
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
    const desde = FECHA.test(sp.get("desde") ?? "") ? sp.get("desde")! : hoy;
    const hasta = FECHA.test(sp.get("hasta") ?? "") ? sp.get("hasta")! : hoy;
    const camionRaw = sp.get("camion_id") ?? "";
    const camionId = UUID.test(camionRaw) ? camionRaw : null;
    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const tV = quoteSchemaTable(schema, "ventas");
    const tI = quoteSchemaTable(schema, "ventas_items");
    const tM = quoteSchemaTable(schema, "movimientos_inventario");
    const tC = quoteSchemaTable(schema, "camiones");
    const tCl = quoteSchemaTable(schema, "clientes");

    const camionesQ = await pool.query<{ id: string; alias: string }>(
      `SELECT id::text, alias FROM ${tC} WHERE empresa_id = $1::uuid ORDER BY alias`,
      [empresaId]
    );

    // Ventas del período que salieron de un camión (una fila por venta).
    const ventasCte = `
      WITH vc AS (
        SELECT DISTINCT ON (v.id) v.id, v.cliente_id, v.total, c.id AS camion_id
          FROM ${tV} v
          JOIN ${tM} m ON m.empresa_id = v.empresa_id AND m.referencia = v.numero_control
                      AND lower(m.origen) = 'venta'
          JOIN ${tC} c ON c.ubicacion_id = m.ubicacion_id AND c.empresa_id = v.empresa_id
         WHERE v.empresa_id = $1::uuid
           AND COALESCE(v.estado, '') <> 'anulada'
           AND (v.fecha AT TIME ZONE '${TZ}')::date >= $2::date
           AND (v.fecha AT TIME ZONE '${TZ}')::date <= $3::date
           AND ($4::uuid IS NULL OR c.id = $4::uuid)
         ORDER BY v.id
      )`;
    const args = [empresaId, desde, hasta, camionId];

    const prod = await pool.query<{ producto: string; cantidad: string; importe: string; ventas: string }>(
      `${ventasCte}
       SELECT i.producto_nombre AS producto, SUM(i.cantidad)::text AS cantidad,
              SUM(i.total_linea)::text AS importe, COUNT(DISTINCT vc.id)::text AS ventas
         FROM vc JOIN ${tI} i ON i.venta_id = vc.id
        GROUP BY i.producto_nombre
        ORDER BY SUM(i.cantidad) DESC, SUM(i.total_linea) DESC
        LIMIT 100`,
      args
    );
    const cli = await pool.query<{ cliente: string | null; ventas: string; total: string }>(
      `${ventasCte}
       SELECT COALESCE(NULLIF(btrim(cl.nombre), ''), 'Consumidor final') AS cliente,
              COUNT(*)::text AS ventas, SUM(vc.total)::text AS total
         FROM vc LEFT JOIN ${tCl} cl ON cl.id = vc.cliente_id
        GROUP BY vc.cliente_id, cl.nombre
        ORDER BY SUM(vc.total) DESC
        LIMIT 100`,
      args
    );
    const tot = await pool.query<{ ventas: string; total: string }>(
      `${ventasCte} SELECT COUNT(*)::text AS ventas, COALESCE(SUM(total), 0)::text AS total FROM vc`,
      args
    );

    return NextResponse.json(
      successResponse({
        desde,
        hasta,
        camiones: camionesQ.rows,
        ventas: Number(tot.rows[0]?.ventas) || 0,
        total: Number(tot.rows[0]?.total) || 0,
        productos: prod.rows.map((r) => ({
          producto: r.producto,
          cantidad: Number(r.cantidad) || 0,
          importe: Number(r.importe) || 0,
          ventas: Number(r.ventas) || 0,
        })),
        clientes: cli.rows.map((r) => ({
          cliente: r.cliente ?? "Consumidor final",
          ventas: Number(r.ventas) || 0,
          total: Number(r.total) || 0,
        })),
      })
    );
  } catch (e) {
    console.error("[/api/reportes/ranking-camion]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo armar el ranking."), { status: 500 });
  }
}
