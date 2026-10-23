import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/productos/mas-vendidos?limit=9
 *
 * Los productos que MÁS se vendieron (por cantidad) en los últimos 90 días,
 * para el acceso rápido de la caja. Devuelve solo los ids, ordenados de más a
 * menos vendido; la caja los cruza con su catálogo —que ya trae stock, precio
 * e imagen— así no se duplica esa data.
 *
 * Las ventas anuladas no cuentan. Si no hay historial (o falta la tabla de
 * items), devuelve [] y la caja cae a los primeros productos del catálogo, para
 * que nunca se quede sin nada que mostrar.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

    const limit = Math.max(1, Math.min(30, Number(request.nextUrl.searchParams.get("limit")) || 9));

    // Sin la tabla de items no hay ranking: vacío, y la caja cae al catálogo.
    const existe = await queryWithRetry<{ v: string | null; vi: string | null }>(
      pool,
      `SELECT to_regclass($1)::text AS v, to_regclass($2)::text AS vi`,
      [`${schema}.ventas`, `${schema}.ventas_items`]
    );
    if (!existe.rows[0]?.v || !existe.rows[0]?.vi) {
      return NextResponse.json(successResponse({ ids: [] }));
    }

    const tV = quoteSchemaTable(schema, "ventas");
    const tVI = quoteSchemaTable(schema, "ventas_items");

    // `limit` ya está saneado a un entero entre 1 y 30: se interpola sin riesgo.
    const { rows } = await queryWithRetry<{ producto_id: string }>(
      pool,
      `SELECT vi.producto_id
         FROM ${tVI} vi
         JOIN ${tV} v ON v.id = vi.venta_id
        WHERE v.empresa_id = $1::uuid
          AND COALESCE(v.estado, '') <> 'anulada'
          AND vi.producto_id IS NOT NULL
          AND v.fecha >= now() - interval '90 days'
        GROUP BY vi.producto_id
        ORDER BY sum(vi.cantidad) DESC NULLS LAST
        LIMIT ${limit}`,
      [empresaId]
    );

    return NextResponse.json(successResponse({ ids: rows.map((r) => r.producto_id) }));
  } catch (err) {
    console.error("[/api/productos/mas-vendidos GET]", err instanceof Error ? err.message : err);
    // La caja tiene que seguir andando: ante cualquier error, sin ranking.
    return NextResponse.json(successResponse({ ids: [] }));
  }
}
