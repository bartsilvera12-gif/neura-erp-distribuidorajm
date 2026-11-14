import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getConciliacionCaja } from "@/lib/cajas/server/conciliacion-pg";
import { hoyEnAsuncion } from "@/lib/reportes/ventas-reporte";

export const runtime = "nodejs";

/** GET /api/cajas/conciliacion?fecha=AAAA-MM-DD — desglose de caja del día (solo lectura). */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const pedida = request.nextUrl.searchParams.get("fecha") ?? "";
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : hoyEnAsuncion();
    const data = await getConciliacionCaja(schema, ctx.auth.empresa_id, fecha);
    return NextResponse.json(successResponse(data));
  } catch (e) {
    console.error("[/api/cajas/conciliacion GET]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo armar la conciliación de caja."), { status: 500 });
  }
}
