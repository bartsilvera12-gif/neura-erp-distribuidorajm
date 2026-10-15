import "server-only";
import { NextRequest } from "next/server";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { POST as borradorPOST } from "@/app/api/facturas/[id]/sifen/borrador/route";
import { POST as xmlPOST } from "@/app/api/facturas/[id]/sifen/xml/route";
import { POST as firmarPOST } from "@/app/api/facturas/[id]/sifen/firmar/route";
import { POST as enviarPOST } from "@/app/api/facturas/[id]/sifen/enviar/route";
import { POST as consultaLotePOST } from "@/app/api/facturas/[id]/sifen/consulta-lote/route";

/**
 * Los pasos de SIFEN de una factura, corridos desde el servidor con los mismos
 * handlers que usa el módulo Facturas (borrador → xml → firmar → enviar, y
 * después consulta-lote). Así la caja no tiene su propia versión del circuito:
 * cualquier arreglo en esos pasos vale para las dos.
 *
 * Cada paso recibe una request con la sesión del usuario (Authorization y
 * cookies), como si la hubiera hecho el navegador.
 */

type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

const PASOS: Record<string, Handler> = {
  borrador: borradorPOST,
  xml: xmlPOST,
  firmar: firmarPOST,
  enviar: enviarPOST,
  "consulta-lote": consultaLotePOST,
};
export type PasoSifen = keyof typeof PASOS;

export async function correrPaso(
  original: Request,
  facturaId: string,
  paso: PasoSifen
): Promise<{ ok: true } | { ok: false; message: string }> {
  const headers = new Headers();
  for (const h of ["authorization", "cookie"]) {
    const v = original.headers.get(h);
    if (v) headers.set(h, v);
  }
  const url = new URL(`/api/facturas/${facturaId}/sifen/${paso}`, original.url);
  const req = new NextRequest(url, { method: "POST", headers });
  const res = await PASOS[paso](req, { params: Promise.resolve({ id: facturaId }) });
  if (res.ok) return { ok: true };
  let message = `SIFEN (${paso}): error ${res.status}`;
  try {
    const j = (await res.json()) as { error?: string; message?: string };
    if (j.error || j.message) message = `SIFEN (${paso}): ${j.error ?? j.message}`;
  } catch {
    /* respuesta sin JSON */
  }
  return { ok: false, message };
}

export type EstadoSifen = {
  estado_sifen: string | null;
  error: string | null;
  cdc: string | null;
};

export async function estadoSifen(
  supabase: AppSupabaseClient,
  empresaId: string,
  facturaId: string
): Promise<EstadoSifen> {
  const { data } = await supabase
    .from("factura_electronica")
    .select("estado_sifen, error, cdc")
    .eq("factura_id", facturaId)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  const r = (data ?? {}) as { estado_sifen?: string | null; error?: string | null; cdc?: string | null };
  return { estado_sifen: r.estado_sifen ?? null, error: r.error ?? null, cdc: r.cdc ?? null };
}

/** Qué pasos faltan según dónde quedó la factura electrónica. */
export function pasosPendientes(estado: string | null): PasoSifen[] {
  switch (estado) {
    case null:
    case "":
      return ["borrador", "xml", "firmar", "enviar"];
    case "borrador":
      return ["xml", "firmar", "enviar"];
    case "generado":
      return ["firmar", "enviar"];
    case "firmado":
      return ["enviar"];
    // Falló el envío: se regenera y se vuelve a mandar.
    case "error_envio":
      return ["xml", "firmar", "enviar"];
    default:
      // enviado (falta la respuesta), aprobado, rechazado, cancelado: nada que mandar.
      return [];
  }
}
