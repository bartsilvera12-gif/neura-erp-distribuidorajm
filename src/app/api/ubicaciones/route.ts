import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { listarUbicacionesFijas } from "@/lib/repartos/server/repartos-pg";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { queryWithRetry } from "@/lib/supabase/pg-retry";

/**
 * GET /api/ubicaciones — salón y depósitos, para elegir destino de una
 * transferencia. Los camiones no entran: se mueve mercadería desde el camión
 * hacia un punto fijo, no de un camión a otro.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));

    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(successResponse({ ubicaciones: [] }));

    const existe = await queryWithRetry<{ t: string | null }>(
      pool,
      `SELECT to_regclass($1)::text AS t`,
      [`${schema}.inventario_ubicaciones`]
    );
    if (!existe.rows[0]?.t) {
      return NextResponse.json(successResponse({ ubicaciones: [] }));
    }

    const ubicaciones = await listarUbicacionesFijas({ schema, empresaId });
    return NextResponse.json(successResponse({ ubicaciones }));
  } catch (err) {
    console.error("[/api/ubicaciones GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar las ubicaciones."), {
      status: 500,
    });
  }
}
