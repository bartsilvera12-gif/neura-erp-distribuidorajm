import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresa } from "@/lib/modulos/resolve-effective-modules";
import {
  datosDesdeSistema,
  guardarPlanilla,
  hayPlanillas,
  limpiarDatos,
  planillaArqueo,
  planillaGuardada,
  PlanillaError,
} from "@/lib/cajas/server/planilla-pg";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/cajas/[id]/planilla — la planilla de arqueo de la caja: la que se
 * guardó, o si todavía no hay, una armada con lo que el sistema ya sabe.
 */
export async function GET(request: NextRequest, context: Ctx) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("Caja inválida."), { status: 400 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const sistema = await planillaArqueo(pool, schema, ctx.auth.empresa_id, id);
    if (!sistema) return NextResponse.json(errorResponse("La caja no existe."), { status: 404 });
    const guardada = await planillaGuardada(pool, schema, ctx.auth.empresa_id, id);
    return NextResponse.json(
      successResponse({
        disponible: await hayPlanillas(pool, schema),
        es_admin: esRolAdminEmpresa(ctx.auth.rol),
        sistema,
        guardada,
        datos: guardada?.datos ?? datosDesdeSistema(sistema),
      })
    );
  } catch (e) {
    console.error("[/api/cajas/[id]/planilla GET]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo armar la planilla."), { status: 500 });
  }
}

/** PUT /api/cajas/[id]/planilla — { datos, enviar }: guarda (y si `enviar`, la manda al administrador). */
export async function PUT(request: NextRequest, context: Ctx) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("Caja inválida."), { status: 400 });
    const b = (await request.json().catch(() => ({}))) as { datos?: unknown; enviar?: unknown };
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const g = await guardarPlanilla(pool, schema, ctx.auth.empresa_id, id, {
      datos: limpiarDatos(b.datos),
      enviar: b.enviar === true,
      usuarioId: ctx.auth.usuarioCatalogId ?? null,
      esAdmin: esRolAdminEmpresa(ctx.auth.rol),
    });
    return NextResponse.json(successResponse({ guardada: g }));
  } catch (e) {
    if (e instanceof PlanillaError) return NextResponse.json(errorResponse(e.message), { status: e.status });
    console.error("[/api/cajas/[id]/planilla PUT]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo guardar la planilla."), { status: 500 });
  }
}
