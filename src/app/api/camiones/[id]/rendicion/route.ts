import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/camiones/[id]/rendicion — las últimas cajas (recorridos) de quien
 * maneja este camión, la más nueva primero. Con el id de una de ellas se arma
 * la rendición (cargado, devuelto, vendido, importes) en /api/cajas/[id]/planilla.
 * Es solo lectura.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("Camión inválido."), { status: 400 });
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id));
    const empresaId = ctx.auth.empresa_id;

    const cam = await pool.query<{ repartidor_id: string | null }>(
      `SELECT repartidor_id::text AS repartidor_id FROM ${quoteSchemaTable(schema, "camiones")}
        WHERE id = $1::uuid AND empresa_id = $2::uuid`,
      [id, empresaId]
    );
    if (!cam.rows[0]) return NextResponse.json(errorResponse("Ese camión no existe."), { status: 404 });
    const repartidor = cam.rows[0].repartidor_id;
    if (!repartidor) return NextResponse.json(successResponse({ cajas: [] }));

    const r = await pool.query<{ id: string; numero_caja: number; estado: string; fecha_apertura: string }>(
      `SELECT id::text AS id, numero_caja, estado, fecha_apertura::text AS fecha_apertura
         FROM ${quoteSchemaTable(schema, "cajas")}
        WHERE empresa_id = $1::uuid AND COALESCE(to_jsonb(cajas)->>'abierta_por', to_jsonb(cajas)->>'usuario_id') = $2
        ORDER BY fecha_apertura DESC
        LIMIT 15`,
      [empresaId, repartidor]
    );
    return NextResponse.json(successResponse({ cajas: r.rows }));
  } catch (e) {
    console.error("[/api/camiones/[id]/rendicion]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo leer la rendición del camión."), { status: 500 });
  }
}
