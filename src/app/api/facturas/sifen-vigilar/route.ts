import { NextRequest, NextResponse } from "next/server";
import { getFacturasSupabaseFromAuth } from "@/lib/facturacion/facturas-service-client";
import { errorResponse, successResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { vigilarFacturasSifen } from "@/lib/ventas/server/sifen-vigilante";

/**
 * POST /api/facturas/sifen-vigilar
 *
 * Lo llama la app cada minuto mientras alguien la tiene abierta: termina por
 * detrás las facturas electrónicas de la caja que quedaron sin respuesta de la
 * SET y avisa en la campanita si alguna tiene un problema.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getFacturasSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const r = await vigilarFacturasSifen(
      request,
      ctx.supabase,
      ctx.auth.empresa_id,
      ctx.auth.usuarioCatalogId ?? null
    );
    return NextResponse.json(successResponse(r));
  } catch (e) {
    console.error("[/api/facturas/sifen-vigilar]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo revisar las facturas electrónicas."), { status: 500 });
  }
}
