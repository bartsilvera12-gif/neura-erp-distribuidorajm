/**
 * POST /api/facturas/[id]/enviar-whatsapp
 *
 * Envia el PDF de la factura al telefono del cliente por el canal de WhatsApp
 * por QR (Baileys) configurado en la empresa.
 *
 * PDF que manda (en orden de preferencia):
 *  1. **KuDE SIFEN** si la factura tiene documento electronico aprobado por SET
 *     (empresa_sifen_config activa + estado_sifen='aprobado' + XML firmado).
 *     Este es el PDF legal, con CDC y QR de la SET.
 *  2. **Recibo simple** (A5, Helvetica) como fallback pre-SIFEN. Se ira
 *     descartando cuando la empresa termine de activar facturacion electronica.
 *
 * Requiere:
 * - La factura debe existir y pertenecer a la empresa del usuario.
 * - El cliente debe tener `telefono`.
 * - Debe existir al menos un chat_channel activo con provider='baileys' y
 *   `config.baileys_bridge_url`.
 */

import { NextRequest, NextResponse } from "next/server";
import { getFacturasSupabaseFromAuth } from "@/lib/facturacion/facturas-service-client";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { buildFacturaPdfBuffer } from "@/lib/facturacion/factura-pdf";
import { sendMediaViaBaileysBridge } from "@/lib/chat/outbound-send-dispatch";
import { normalizeWaPhone } from "@/lib/chat/wa-phone";
import { downloadSifenObject } from "@/lib/sifen/sifen-storage";
import { buildKudePdfBuffer, type KudeBranding } from "@/lib/sifen/kude-pdf";
import {
  kudeFallbackQrUrl,
  parseKudeFromSignedRdeXml,
} from "@/lib/sifen/parse-kude-from-signed-xml";
import type { SifenConsultaLoteUltimaPersistida } from "@/lib/sifen/types";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export const runtime = "nodejs";

type ChannelConfig = { baileys_bridge_url?: string };

/**
 * Intenta construir el KuDE SIFEN de la factura. Devuelve null si:
 * - No hay documento electronico
 * - No esta aprobado por SET
 * - Falta XML firmado o hay inconsistencia
 * En cualquier caso el caller cae al recibo simple.
 */
async function tryBuildKudePdf(
  supabase: AppSupabaseClient,
  empresaId: string,
  facturaId: string,
  numeroFactura: string
): Promise<{ pdf: Buffer; filename: string; cdc: string } | null> {
  try {
    const { data: fe } = await supabase
      .from("factura_electronica")
      .select("estado_sifen, xml_firmado_path, cdc, sifen_ultima_respuesta_consulta_lote")
      .eq("factura_id", facturaId)
      .eq("empresa_id", empresaId)
      .maybeSingle();

    if (!fe || String(fe.estado_sifen) !== "aprobado") return null;
    const xmlPath = fe.xml_firmado_path == null ? "" : String(fe.xml_firmado_path).trim();
    if (!xmlPath) return null;

    const dl = await downloadSifenObject(supabase, xmlPath);
    if (!dl.ok) return null;

    const parsed = parseKudeFromSignedRdeXml(dl.data.toString("utf8"));
    const cdcBd = fe.cdc == null ? "" : String(fe.cdc).trim();
    if (cdcBd && cdcBd !== parsed.cdc) return null;

    const consulta = fe.sifen_ultima_respuesta_consulta_lote as
      | SifenConsultaLoteUltimaPersistida
      | null
      | undefined;
    const dProtAut = (() => {
      const rows =
        consulta && typeof consulta === "object"
          ? ((consulta as { detallePorCdc?: { cdc: string; dProtAut: string | null }[] })
              .detallePorCdc ?? [])
          : [];
      const hit = rows.find((r) => r.cdc === parsed.cdc);
      const v = hit?.dProtAut;
      return v != null && String(v).trim() !== "" ? String(v).trim() : null;
    })();

    const qrUrl = parsed.dCarQR ?? kudeFallbackQrUrl(parsed.cdc);

    // Branding opcional
    const branding = await (async (): Promise<KudeBranding | null> => {
      try {
        const { data } = await supabase
          .from("empresa_sifen_config")
          .select("kude_color_primario, kude_color_primario_fill")
          .eq("empresa_id", empresaId)
          .maybeSingle();
        if (!data) return null;
        const row = data as {
          kude_color_primario?: string | null;
          kude_color_primario_fill?: string | null;
        };
        return {
          logoBytes: null,
          colorPrimario: row.kude_color_primario ?? null,
          colorPrimarioFill: row.kude_color_primario_fill ?? null,
        };
      } catch {
        return null;
      }
    })();

    const pdf = await buildKudePdfBuffer({
      parsed,
      numeroFactura,
      dProtAut,
      qrUrl,
      branding,
    });
    const safe = numeroFactura.replace(/[^\w.-]+/g, "_").slice(0, 40);
    const filename = `KuDE-${safe || "factura"}-${parsed.cdc.slice(-8)}.pdf`;
    return { pdf, filename, cdc: parsed.cdc };
  } catch (e) {
    console.warn("[enviar-whatsapp] KuDE fallback a recibo simple:", e instanceof Error ? e.message : e);
    return null;
  }
}

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

  // 5. PDF — SIFEN KuDE si esta aprobado, recibo simple si no.
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

  const kude = await tryBuildKudePdf(supabase, auth.empresa_id, id, f.numero_factura ?? "");
  let pdf: Buffer;
  let filename: string;
  let variante: "kude_sifen" | "recibo_simple";
  if (kude) {
    pdf = kude.pdf;
    filename = kude.filename;
    variante = "kude_sifen";
  } else {
    pdf = await buildFacturaPdfBuffer({
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
    filename = `${f.numero_factura || "factura"}.pdf`.replace(/[^\w.-]+/g, "_");
    variante = "recibo_simple";
  }

  // 6. Enviar por el puente
  const etiqueta = variante === "kude_sifen" ? "factura" : "recibo";
  const caption =
    `Hola ${nombreCliente.split(" ")[0]}, ` +
    `te enviamos ${etiqueta === "factura" ? "la factura" : "el recibo"} ${f.numero_factura} por ` +
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
    successResponse({ waMessageId: result.waMessageId ?? null, to: toDigits, filename, variante })
  );
}
