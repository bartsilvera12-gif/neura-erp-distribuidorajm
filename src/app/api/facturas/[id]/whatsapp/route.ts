import { NextRequest, NextResponse } from "next/server";
import { getFacturasSupabaseFromAuth } from "@/lib/facturacion/facturas-service-client";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * Teléfono en formato internacional para wa.me (Paraguay: 0981 123 456 →
 * 595981123456). `null` si no parece un celular.
 */
function telefonoWhatsapp(raw: string | null | undefined): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("595")) return d.length >= 11 ? d : null;
  if (d.startsWith("0")) d = d.slice(1);
  return d.length >= 8 && d.length <= 10 ? `595${d}` : null;
}

/**
 * GET /api/facturas/[id]/whatsapp — datos para mandarle la factura al cliente
 * por WhatsApp: su teléfono (listo para wa.me), nombre, número y total.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getFacturasSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { auth, supabase } = ctx;
    const { id } = await context.params;

    const { data: f } = await supabase
      .from("facturas")
      .select("id, cliente_id, numero_factura, monto")
      .eq("id", id)
      .eq("empresa_id", auth.empresa_id)
      .maybeSingle();
    if (!f) return NextResponse.json(errorResponse("La factura no existe."), { status: 404 });

    const factura = f as { cliente_id: string | null; numero_factura: string | null; monto: number | string | null };
    let cliente = "";
    let telefono: string | null = null;
    if (factura.cliente_id) {
      const { data: c } = await supabase
        .from("clientes")
        .select("razon_social, nombre, empresa, telefono")
        .eq("id", factura.cliente_id)
        .eq("empresa_id", auth.empresa_id)
        .maybeSingle();
      const cl = (c ?? {}) as { razon_social?: string | null; nombre?: string | null; empresa?: string | null; telefono?: string | null };
      cliente = (cl.razon_social || cl.nombre || cl.empresa || "").trim();
      telefono = telefonoWhatsapp(cl.telefono);
    }
    return NextResponse.json(
      successResponse({
        cliente,
        telefono,
        numero: factura.numero_factura ?? "",
        total: Number(factura.monto ?? 0),
      })
    );
  } catch (e) {
    console.error("[/api/facturas/[id]/whatsapp]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudieron leer los datos del cliente."), { status: 500 });
  }
}
