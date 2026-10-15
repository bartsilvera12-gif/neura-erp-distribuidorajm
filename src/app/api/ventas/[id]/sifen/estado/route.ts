import { NextRequest, NextResponse } from "next/server";
import { getFacturasSupabaseFromAuth } from "@/lib/facturacion/facturas-service-client";
import { errorResponse, successResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { correrPaso, estadoSifen } from "@/lib/ventas/server/sifen-pasos";

/**
 * POST /api/ventas/[id]/sifen/estado
 *
 * Pregunta a la SET cómo quedó la factura electrónica de la venta (consulta
 * del lote) y devuelve el estado: enviado (todavía procesando), aprobado o
 * rechazado. Es POST porque la consulta actualiza la factura.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getFacturasSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;
    const { id } = await params;

    const { data: venta, error } = await supabase
      .from("ventas")
      .select("factura_id")
      .eq("id", id?.trim() ?? "")
      .eq("empresa_id", auth.empresa_id)
      .maybeSingle();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    const facturaId = (venta as { factura_id?: string | null } | null)?.factura_id ?? null;
    if (!facturaId) {
      return NextResponse.json(errorResponse("Esta venta no tiene factura electrónica."), { status: 404 });
    }

    const antes = await estadoSifen(supabase, auth.empresa_id, facturaId);
    let aviso: string | null = null;
    if (antes.estado_sifen === "enviado") {
      const r = await correrPaso(request, facturaId, "consulta-lote");
      // La SET todavía procesando no es un error: se vuelve a preguntar.
      if (!r.ok) aviso = r.message;
    }
    const ahora = await estadoSifen(supabase, auth.empresa_id, facturaId);
    return NextResponse.json(successResponse({ factura_id: facturaId, aviso, ...ahora }));
  } catch (err) {
    console.error("[/api/ventas/[id]/sifen/estado]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      errorResponse(err instanceof Error ? err.message : "No se pudo consultar a la SET."),
      { status: 500 }
    );
  }
}
