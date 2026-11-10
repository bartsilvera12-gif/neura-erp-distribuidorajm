import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresa } from "@/lib/modulos/resolve-effective-modules";
import { getArqueoMensual } from "@/lib/reportes/arqueo-mensual-pg";

export const runtime = "nodejs";

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * GET /api/reportes/arqueo-mensual?mes=YYYY-MM — el arqueo de todas las cajas
 * del mes, por persona y por día. Es de control: solo el administrador.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresa(ctx.auth.rol)) {
      return NextResponse.json(errorResponse("Este reporte es solo para el administrador."), { status: 403 });
    }
    const sp = request.nextUrl.searchParams;
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date()).slice(0, 7);
    const mes = MES.test(sp.get("mes") ?? "") ? sp.get("mes")! : hoy;
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    return NextResponse.json(successResponse(await getArqueoMensual(schema, ctx.auth.empresa_id, mes)));
  } catch (e) {
    console.error("[/api/reportes/arqueo-mensual]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo armar el arqueo del mes."), { status: 500 });
  }
}
