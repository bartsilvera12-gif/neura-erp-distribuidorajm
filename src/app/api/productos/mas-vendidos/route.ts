import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/productos/mas-vendidos
 *
 * Parámetros (todos opcionales):
 *   - `limit`           número máximo de filas (default 9, máximo 500).
 *   - `desde`, `hasta`  rango de fechas YYYY-MM-DD en hora Asunción (inclusive).
 *                       Default: últimos 90 días (compatibilidad con el consumo
 *                       anterior de la Caja).
 *   - `ubicacion_id`    UUID de una ubicación del inventario:
 *                         * si es un camión  → solo ventas que salieron de ese
 *                           camión (vía reparto.ubicacion_id).
 *                         * si es el salón   → solo ventas SIN reparto.
 *                       Sin este parámetro, el ranking es general (incluye todo).
 *   - `formato`         "ids" (default, compatibilidad con la Caja) o "detalle"
 *                       (devuelve también nombre, sku, cantidad y total).
 *
 * Las ventas anuladas no cuentan. Pedido explícito de la clienta de
 * Distribuidora JM (soporte, punto 4).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

    const params = request.nextUrl.searchParams;
    const limit = Math.max(1, Math.min(500, Number(params.get("limit")) || 9));
    const formato = params.get("formato") === "detalle" ? "detalle" : "ids";
    const desde = (params.get("desde") ?? "").trim();
    const hasta = (params.get("hasta") ?? "").trim();
    const ubicacionIdRaw = (params.get("ubicacion_id") ?? "").trim();
    const ubicacionId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ubicacionIdRaw)
      ? ubicacionIdRaw
      : null;

    const existe = await queryWithRetry<{ v: string | null; vi: string | null }>(
      pool,
      `SELECT to_regclass($1)::text AS v, to_regclass($2)::text AS vi`,
      [`${schema}.ventas`, `${schema}.ventas_items`]
    );
    if (!existe.rows[0]?.v || !existe.rows[0]?.vi) {
      return NextResponse.json(successResponse({ ids: [], filas: [] }));
    }

    const tV = quoteSchemaTable(schema, "ventas");
    const tVI = quoteSchemaTable(schema, "ventas_items");
    const tP = quoteSchemaTable(schema, "productos");
    const tR = quoteSchemaTable(schema, "repartos");
    const tC = quoteSchemaTable(schema, "camiones");
    const tU = quoteSchemaTable(schema, "inventario_ubicaciones");

    // Cuando hay una ubicación, resolvemos si es salón o camión para armar el
    // filtro apropiado. Un mismo endpoint asi cubre los dos casos sin cambiar
    // el contrato (ranking del salón = ventas SIN reparto; ranking de un
    // camión = ventas cuyo reparto va a ESE camión).
    let origenFiltro: "general" | "salon" | "camion" = "general";
    if (ubicacionId) {
      try {
        const tipoQ = await queryWithRetry<{ tipo: string | null }>(
          pool,
          `SELECT lower(COALESCE(tipo, '')) AS tipo FROM ${tU} WHERE id = $1::uuid AND empresa_id = $2::uuid`,
          [ubicacionId, empresaId]
        );
        const tipo = tipoQ.rows[0]?.tipo ?? "";
        if (tipo === "salon") origenFiltro = "salon";
        else if (tipo === "camion") origenFiltro = "camion";
        else origenFiltro = "camion"; // depósito u otro → tratamos como camión (filtra por ubicación)
      } catch (e) {
        console.warn("[/api/productos/mas-vendidos] tipo ubicación:", e instanceof Error ? e.message : e);
      }
    }

    // Rango de fechas. Si falta uno, se usa default: últimos 90 días hasta hoy.
    const condFecha: string[] = [];
    const qParams: unknown[] = [empresaId];
    if (/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
      qParams.push(desde);
      condFecha.push(`v.fecha >= $${qParams.length}::date`);
    } else if (!hasta) {
      condFecha.push(`v.fecha >= now() - interval '90 days'`);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
      qParams.push(hasta);
      // < hasta+1día: incluye todo el día de `hasta` sin importar la hora.
      condFecha.push(`v.fecha < ($${qParams.length}::date + interval '1 day')`);
    }

    // Filtro de origen por ubicación.
    let condOrigen = "";
    let joinExtra = "";
    if (origenFiltro === "salon") {
      condOrigen = `AND v.reparto_id IS NULL`;
    } else if (origenFiltro === "camion" && ubicacionId) {
      qParams.push(ubicacionId);
      joinExtra = `
        LEFT JOIN ${tR} r ON r.id = v.reparto_id
        LEFT JOIN ${tC} c ON c.id = r.camion_id
      `;
      condOrigen = `AND c.ubicacion_id = $${qParams.length}::uuid`;
    }

    const selectDetalle = formato === "detalle"
      ? `, COALESCE(p.nombre, '') AS nombre, COALESCE(p.sku, '') AS sku,
           sum(vi.cantidad)::text AS cantidad,
           sum(vi.total_linea)::text AS total`
      : `, sum(vi.cantidad)::text AS cantidad`;

    const joinP = formato === "detalle" ? `LEFT JOIN ${tP} p ON p.id = vi.producto_id` : "";
    const groupExtra = formato === "detalle" ? ", p.nombre, p.sku" : "";

    const sql = `
      SELECT vi.producto_id ${selectDetalle}
        FROM ${tVI} vi
        JOIN ${tV} v ON v.id = vi.venta_id
        ${joinExtra}
        ${joinP}
       WHERE v.empresa_id = $1::uuid
         AND COALESCE(v.estado, '') <> 'anulada'
         AND vi.producto_id IS NOT NULL
         ${condFecha.map((c) => "AND " + c).join(" ")}
         ${condOrigen}
       GROUP BY vi.producto_id ${groupExtra}
       ORDER BY sum(vi.cantidad) DESC NULLS LAST
       LIMIT ${limit}`;

    const { rows } = await queryWithRetry<Record<string, string>>(pool, sql, qParams);

    if (formato === "ids") {
      return NextResponse.json(successResponse({ ids: rows.map((r) => r.producto_id) }));
    }
    const filas = rows.map((r) => ({
      producto_id: r.producto_id,
      nombre: r.nombre ?? "",
      sku: r.sku ?? "",
      cantidad: Number(r.cantidad) || 0,
      total: Number(r.total) || 0,
    }));
    return NextResponse.json(successResponse({ filas }));
  } catch (err) {
    console.error("[/api/productos/mas-vendidos GET]", err instanceof Error ? err.message : err);
    // La caja tiene que seguir andando: ante cualquier error, sin ranking.
    return NextResponse.json(successResponse({ ids: [], filas: [] }));
  }
}
