import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresa } from "@/lib/modulos/resolve-effective-modules";
import { listarPlanillas } from "@/lib/cajas/server/planilla-pg";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/planillas-arqueo?desde=&hasta= — las planillas de los camioneros (administrador). */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresa(ctx.auth.rol)) {
      return NextResponse.json(errorResponse("Solo un administrador ve las planillas de todos."), { status: 403 });
    }
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });
    const sp = request.nextUrl.searchParams;
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
    const desde = FECHA.test(sp.get("desde") ?? "") ? sp.get("desde")! : `${hoy.slice(0, 8)}01`;
    const hasta = FECHA.test(sp.get("hasta") ?? "") ? sp.get("hasta")! : hoy;
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    return NextResponse.json(successResponse(await listarPlanillas(pool, schema, ctx.auth.empresa_id, { desde, hasta })));
  } catch (e) {
    console.error("[/api/planillas-arqueo]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudieron leer las planillas."), { status: 500 });
  }
}
