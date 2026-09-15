import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { listarCamiones } from "@/lib/repartos/server/repartos-pg";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { queryWithRetry } from "@/lib/supabase/pg-retry";

/** GET /api/camiones — camiones activos, para el alta del reparto. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));

    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(successResponse({ camiones: [] }));

    // Un schema sin `camiones` devuelve la lista vacía en vez de romper: la
    // pantalla ya sabe mostrar "no hay camiones cargados".
    const existe = await queryWithRetry<{ t: string | null }>(
      pool,
      `SELECT to_regclass($1)::text AS t`,
      [`${schema}.camiones`]
    );
    if (!existe.rows[0]?.t) {
      return NextResponse.json(successResponse({ camiones: [] }));
    }

    const camiones = await listarCamiones({ schema, empresaId });
    return NextResponse.json(successResponse({ camiones }));
  } catch (err) {
    console.error("[/api/camiones GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los camiones."), { status: 500 });
  }
}
