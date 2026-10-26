import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresa } from "@/lib/modulos/resolve-effective-modules";
import { marcarRevisada, PlanillaError } from "@/lib/cajas/server/planilla-pg";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/planillas-arqueo/[id]/revisar — { revisada }: el administrador la da por revisada. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresa(ctx.auth.rol)) {
      return NextResponse.json(errorResponse("Solo un administrador revisa planillas."), { status: 403 });
    }
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("Planilla inválida."), { status: 400 });
    const b = (await request.json().catch(() => ({}))) as { revisada?: unknown };
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    await marcarRevisada(pool, schema, ctx.auth.empresa_id, id, b.revisada !== false, ctx.auth.user?.email ?? null);
    return NextResponse.json(successResponse({ ok: true }));
  } catch (e) {
    if (e instanceof PlanillaError) return NextResponse.json(errorResponse(e.message), { status: e.status });
    console.error("[/api/planillas-arqueo/[id]/revisar]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo marcar la planilla."), { status: 500 });
  }
}
