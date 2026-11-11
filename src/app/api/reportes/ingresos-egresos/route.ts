import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { conMotivo } from "@/lib/api/motivo-error";
import { getReporteIngresosEgresos, rangoPorDefecto } from "@/lib/reportes/ingresos-egresos";

export const runtime = "nodejs";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/reportes/ingresos-egresos — resumen día/semana/mes de la caja. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);

    const sp = request.nextUrl.searchParams;
    const def = rangoPorDefecto("mes");
    const desde = FECHA.test(sp.get("desde") ?? "") ? sp.get("desde")! : def.desde;
    const hasta = FECHA.test(sp.get("hasta") ?? "") ? sp.get("hasta")! : def.hasta;
    if (desde > hasta) {
      return NextResponse.json(errorResponse("La fecha 'desde' no puede ser posterior a 'hasta'."), { status: 400 });
    }

    const data = await getReporteIngresosEgresos(schema, ctx.auth.empresa_id, desde, hasta);
    return NextResponse.json(successResponse(data));
  } catch (e) {
    console.error("[/api/reportes/ingresos-egresos GET]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      errorResponse(conMotivo("No se pudo generar el reporte de ingresos y egresos", e)),
      { status: 500 }
    );
  }
}
