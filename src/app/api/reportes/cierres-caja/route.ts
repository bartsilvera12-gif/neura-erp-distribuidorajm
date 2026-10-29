import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresa } from "@/lib/modulos/resolve-effective-modules";
import { filtrosCierres, listarCierresCaja } from "@/lib/reportes/cierres-caja-pg";

/** GET /api/reportes/cierres-caja?desde=&hasta=&estado= — el arqueo de cada caja del período (administrador). */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresa(ctx.auth.rol)) {
      return NextResponse.json(errorResponse("Solo un administrador ve el reporte de cierres."), { status: 403 });
    }
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const cierres = await listarCierresCaja(schema, ctx.auth.empresa_id, filtrosCierres(request));
    return NextResponse.json(successResponse({ cierres }));
  } catch (e) {
    console.error("[/api/reportes/cierres-caja]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo armar el reporte de cierres."), { status: 500 });
  }
}
