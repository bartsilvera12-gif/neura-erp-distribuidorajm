/**
 * POST /api/facturas/[id]/enviar-whatsapp
 *
 * Genera el PDF del recibo de la factura y lo envia al telefono del cliente
 * por el canal de WhatsApp por QR (Baileys) configurado en la empresa.
 *
 * Requiere:
 * - La factura debe existir y pertenecer a la empresa del usuario.
 * - El cliente debe tener `telefono`.
 * - Debe existir al menos un chat_channel activo con provider='baileys' y
 *   `config.baileys_bridge_url`.
 *
 * Response:
 * - 200 { success: true, data: { waMessageId } }
 * - 400/404/503 { success: false, error }
 */

import { NextRequest, NextResponse } from "next/server";
import { getFacturasSupabaseFromAuth } from "@/lib/facturacion/facturas-service-client";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { buildFacturaPdfBuffer } from "@/lib/facturacion/factura-pdf";
import { sendMediaViaBaileysBridge } from "@/lib/chat/outbound-send-dispatch";
import { normalizeWaPhone } from "@/lib/chat/wa-phone";

export const runtime = "nodejs";

type ChannelConfig = { baileys_bridge_url?: string };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json(errorResponse("Falta id de la factura."), { status: 400 });

  const ctx = await getFacturasSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  const { auth, supabase } = ctx;

  // 1. Factura
  const { data: factura, error: fErr } = await supabase
    .from("facturas")
    .select("id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda, cliente_id")
    .eq("id", id)
    .eq("empresa_id", auth.empresa_id)
    .maybeSingle();
  if (fErr) return NextResponse.json(errorResponse(fErr.message), { status: 400 });
  if (!factura) return NextResponse.json(errorResponse("Factura no encontrada."), { status: 404 });

  // 2. Cliente
  const { data: cliente, error: cErr } = await supabase
    .from("clientes")
    .select("id, nombre_contacto, empresa, tipo_cliente, telefono, telefono_secundario, documento, ruc, numero_socio")
    .eq("id", (factura as { cliente_id: string }).cliente_id)
    .eq("empresa_id", auth.empresa_id)
    .maybeSingle();
  if (cErr) return NextResponse.json(errorResponse(cErr.message), { status: 400 });
  if (!cliente) return NextResponse.json(errorResponse("Cliente no encontrado."), { status: 404 });

  const c = cliente as {
    nombre_contacto?: string | null;
    empresa?: string | null;
    tipo_cliente?: string | null;
    telefono?: string | null;
    telefono_secundario?: string | null;
    documento?: string | null;
    ruc?: string | null;
    numero_socio?: string | number | null;
  };

  const nombreCliente =
    (c.tipo_cliente === "empresa" ? c.empresa : c.nombre_contacto) ??
    c.nombre_contacto ??
    c.empresa ??
    "(sin nombre)";
  const telefono = (c.telefono ?? c.telefono_secundario ?? "").toString();
  const toDigits = normalizeWaPhone(telefono);
  if (!toDigits) {
    return NextResponse.json(
      errorResponse("El cliente no tiene teléfono cargado. Agregalo en la ficha y volvé a intentar."),
      { status: 400 }
    );
  }

  // 3. Empresa (para el emisor del PDF). Va contra public via service role — no
  // depende del schema del tenant.
  const admin = createServiceRoleClient();
  const { data: empresaRow } = await admin
    .from("empresas")
    .select("nombre, razon_social, telefono, email")
    .eq("id", auth.empresa_id)
    .maybeSingle();
  const emp = (empresaRow ?? {}) as {
    nombre?: string | null;
    razon_social?: string | null;
    telefono?: string | null;
    email?: string | null;
  };
  const emisorNombre =
    (emp.nombre ?? emp.razon_social ?? "").toString().trim() || "Asociacion Hernandarias Azulgrana";

  // 4. Canal Baileys activo → bridge URL. chat_channels vive en el schema del
  // tenant, no en public, asi que usamos el supabase ya scopeado (ctx.supabase).
  const { data: canales } = await supabase
    .from("chat_channels")
    .select("id, provider, activo, config")
    .eq("empresa_id", auth.empresa_id)
    .eq("provider", "baileys")
    .eq("activo", true)
    .limit(1);
  const canal = (canales ?? [])[0] as { config?: ChannelConfig } | undefined;
  const bridgeUrl = (canal?.config?.baileys_bridge_url ?? "").trim().replace(/\/+$/, "");
  if (!bridgeUrl) {
    return NextResponse.json(
      errorResponse(
        "No hay canal WhatsApp por QR configurado para esta empresa (falta baileys_bridge_url)."
      ),
      { status: 503 }
    );
  }

  // 5. PDF
  const f = factura as {
    numero_factura: string;
    fecha: string;
    fecha_vencimiento: string;
    monto: number;
    saldo: number;
    estado: string;
    moneda: string;
    tipo: string;
  };
  const pdf = await buildFacturaPdfBuffer({
    factura: {
      numero_factura: f.numero_factura,
      fecha: f.fecha,
      fecha_vencimiento: f.fecha_vencimiento,
      monto: Number(f.monto ?? 0),
      saldo: Number(f.saldo ?? 0),
      estado: f.estado,
      moneda: f.moneda,
      tipo: f.tipo,
      concepto: null,
    },
    cliente: {
      nombre: nombreCliente,
      documento: c.documento ?? c.ruc ?? null,
      numero_socio: c.numero_socio != null ? String(c.numero_socio) : null,
      telefono,
    },
    emisor: {
      nombre: emisorNombre,
      telefono: emp.telefono ?? null,
      email: emp.email ?? null,
    },
  });

  // 6. Enviar por el puente
  const filename = `${f.numero_factura || "factura"}.pdf`.replace(/[^\w.-]+/g, "_");
  const caption =
    `Hola ${nombreCliente.split(" ")[0]}, ` +
    `te enviamos el recibo ${f.numero_factura} por ` +
    `${f.moneda === "USD" ? "USD" : "Gs."} ${Number(f.monto).toLocaleString("es-PY")}. ` +
    `Cualquier duda respondé este mensaje.`;
  const result = await sendMediaViaBaileysBridge(
    bridgeUrl,
    toDigits,
    { buffer: pdf, filename, mimetype: "application/pdf" },
    caption
  );
  if (!result.ok) {
    return NextResponse.json(errorResponse(result.error ?? "El puente WhatsApp rechazó el envío."), { status: 502 });
  }

  return NextResponse.json(
    successResponse({ waMessageId: result.waMessageId ?? null, to: toDigits, filename })
  );
}
