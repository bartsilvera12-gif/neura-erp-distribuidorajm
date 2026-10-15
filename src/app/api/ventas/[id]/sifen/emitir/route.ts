import { NextRequest, NextResponse } from "next/server";
import { getFacturasSupabaseFromAuth } from "@/lib/facturacion/facturas-service-client";
import { errorResponse, successResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { facturaDeVenta } from "@/lib/ventas/server/venta-a-factura";
import { correrPaso, estadoSifen, pasosPendientes } from "@/lib/ventas/server/sifen-pasos";

/**
 * POST /api/ventas/[id]/sifen/emitir
 *
 * Factura electrónica de una venta de la caja: crea la factura (una sola vez
 * por venta), la genera, la firma y la manda a la SET. La aprobación llega
 * después: la caja la pregunta con /sifen/estado hasta que la SET responda.
 *
 * Si SIFEN no está activo devuelve `sifen_activo: false` y la caja sigue con
 * el comprobante de siempre.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getFacturasSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;
    const { id } = await params;
    const ventaId = id?.trim();
    if (!ventaId) return NextResponse.json(errorResponse("Falta la venta."), { status: 400 });

    const { data: cfg } = await supabase
      .from("empresa_sifen_config")
      .select("activo, ambiente")
      .eq("empresa_id", auth.empresa_id)
      .maybeSingle();
    const c = (cfg ?? {}) as { activo?: boolean; ambiente?: string | null };
    if (!c.activo) {
      return NextResponse.json(successResponse({ sifen_activo: false }));
    }

    const fac = await facturaDeVenta(supabase, auth.empresa_id, ventaId);
    if (!fac.ok) return NextResponse.json(errorResponse(fac.message), { status: fac.status });

    const antes = await estadoSifen(supabase, auth.empresa_id, fac.facturaId);
    for (const paso of pasosPendientes(antes.estado_sifen)) {
      const r = await correrPaso(request, fac.facturaId, paso);
      if (!r.ok) {
        const ahora = await estadoSifen(supabase, auth.empresa_id, fac.facturaId);
        return NextResponse.json(
          { ...errorResponse(r.message), data: { sifen_activo: true, factura_id: fac.facturaId, ...ahora } },
          { status: 400 }
        );
      }
    }

    const despues = await estadoSifen(supabase, auth.empresa_id, fac.facturaId);
    return NextResponse.json(
      successResponse({
        sifen_activo: true,
        ambiente: c.ambiente ?? null,
        factura_id: fac.facturaId,
        ...despues,
      })
    );
  } catch (err) {
    console.error("[/api/ventas/[id]/sifen/emitir]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      errorResponse(err instanceof Error ? err.message : "No se pudo emitir la factura electrónica."),
      { status: 500 }
    );
  }
}
