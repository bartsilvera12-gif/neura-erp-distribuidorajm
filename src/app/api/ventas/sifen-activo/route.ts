import { NextRequest, NextResponse } from "next/server";
import { getFacturasSupabaseFromAuth } from "@/lib/facturacion/facturas-service-client";
import { errorResponse, successResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/ventas/sifen-activo — si la empresa emite factura electrónica.
 * La caja lo usa para nombrar las opciones: con SIFEN, «Sin nombre» es una
 * factura innominada y no un ticket.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getFacturasSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { data } = await ctx.supabase
      .from("empresa_sifen_config")
      .select("activo")
      .eq("empresa_id", ctx.auth.empresa_id)
      .maybeSingle();
    return NextResponse.json(successResponse({ activo: (data as { activo?: boolean } | null)?.activo === true }));
  } catch {
    return NextResponse.json(successResponse({ activo: false }));
  }
}
