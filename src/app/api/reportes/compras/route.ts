import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { conMotivo } from "@/lib/api/motivo-error";
import { getReporteCompras, mesEnCursoAsuncion } from "@/lib/reportes/compras-reporte";

export const runtime = "nodejs";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/reportes/compras — Reporte de Compras operativo (todas las compras, con o sin timbrado). */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);

    const sp = request.nextUrl.searchParams;
    const def = mesEnCursoAsuncion();
    const desde = FECHA.test(sp.get("desde") ?? "") ? sp.get("desde")! : def.desde;
    const hasta = FECHA.test(sp.get("hasta") ?? "") ? sp.get("hasta")! : def.hasta;
    if (desde > hasta) {
      return NextResponse.json(
        errorResponse("La fecha 'desde' no puede ser posterior a 'hasta'."),
        { status: 400 }
      );
    }
    const proveedorRaw = sp.get("proveedor_id") ?? "";
    const proveedor_id = UUID.test(proveedorRaw) ? proveedorRaw : null;

    const categoriaRaw = sp.get("categoria_id") ?? "";
    const categoria_id = UUID.test(categoriaRaw) ? categoriaRaw : null;

    const data = await getReporteCompras(schema, ctx.auth.empresa_id, { desde, hasta, proveedor_id, categoria_id });
    return NextResponse.json(successResponse(data));
  } catch (e) {
    console.error("[/api/reportes/compras GET]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      errorResponse(conMotivo("No se pudo generar el reporte de compras", e)),
      { status: 500 }
    );
  }
}
