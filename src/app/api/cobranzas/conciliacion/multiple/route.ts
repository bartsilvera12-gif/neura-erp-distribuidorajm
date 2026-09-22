import { NextRequest, NextResponse } from "next/server";
import { fetchDataSchemaForEmpresaId, createServiceRoleClientForEmpresa } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { requireTenantUserApiAccess } from "@/lib/contabilidad/contabilidad-auth";
import { registrarTransferenciaMultiple, updateComprobantePath, ConciliacionError } from "@/lib/cobranzas/conciliacion-pg";
import { notificarCobroPendiente } from "@/lib/cobranzas/cobro-pendiente-notificar";
import {
  ALLOWED_COMPROBANTE_MIME, MAX_COMPROBANTE_BYTES, COBROS_COMPROBANTES_BUCKET,
  buildCobroComprobantePath, ensureCobrosComprobantesBucket, signCobroComprobante,
  revisarComprobante,
} from "@/lib/cobranzas/conciliacion-comprobante-storage";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El motivo real de un error, en vez de un mensaje genérico. */
function motivoDelError(e: unknown): string {
  const o = (e ?? {}) as { message?: unknown; detail?: unknown; hint?: unknown; code?: unknown };
  const partes = [o.message, o.detail, o.hint].filter((x) => typeof x === "string" && x) as string[];
  const codigo = typeof o.code === "string" && o.code ? ` [${o.code}]` : "";
  const texto = partes.join(" · ");
  if (texto) return texto + codigo;
  const crudo = typeof e === "string" ? e : String(e ?? "");
  return crudo && crudo !== "[object Object]" ? crudo + codigo : "";
}
const s = (v: unknown) => (v == null ? "" : String(v).trim());

/**
 * POST (multipart) — cobro MÚLTIPLE: una transferencia aplicada a varias facturas.
 * Maker: cualquier usuario autenticado. Crea un pendiente por factura (atómico) y
 * comparte el comprobante. La aprobación sigue siendo admin/cobranzas.
 *
 * Campos: cliente_id, banco_origen, titular, numero_operacion, fecha,
 *   items = JSON [{ factura_id, monto, idempotency_key }], file (comprobante).
 */
export async function POST(request: NextRequest) {
  const auth = await requireTenantUserApiAccess(request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });
  try {
    const schema = await fetchDataSchemaForEmpresaId(auth.empresaId);
    const form = await request.formData();

    let items: { factura_id: string; monto: number; idempotency_key: string | null }[] = [];
    try {
      const raw = JSON.parse(s(form.get("items")) || "[]") as unknown[];
      items = (Array.isArray(raw) ? raw : []).map((r) => {
        const o = (r ?? {}) as Record<string, unknown>;
        const idem = s(o.idempotency_key);
        return {
          factura_id: s(o.factura_id),
          monto: Number(o.monto) || 0,
          idempotency_key: UUID_RE.test(idem) ? idem : null,
        };
      }).filter((it) => UUID_RE.test(it.factura_id) && it.monto > 0);
    } catch {
      return NextResponse.json(errorResponse("Lista de facturas inválida."), { status: 400 });
    }
    if (items.length === 0) {
      return NextResponse.json(errorResponse("Seleccioná al menos una factura con monto."), { status: 400 });
    }

    // El comprobante se revisa ANTES de tocar la base: si no sirve, no se
    // registra nada y el mensaje dice qué pasa con ESE archivo. Antes el cobro
    // se guardaba igual y el comprobante se perdía en silencio.
    const archivo = form.get("file");
    if (archivo instanceof File && archivo.size > 0) {
      const problema = revisarComprobante(archivo);
      if (problema) return NextResponse.json(errorResponse(problema), { status: 400 });
    }

    const cobros = await registrarTransferenciaMultiple(schema, auth.empresaId, {
      banco_origen: s(form.get("banco_origen")),
      titular: s(form.get("titular")),
      numero_operacion: s(form.get("numero_operacion")),
      fecha: s(form.get("fecha")) || new Date().toISOString().slice(0, 10),
      created_by: auth.usuarioCatalogId ?? null,
      items,
    });

    // Comprobante opcional: se sube UNA vez y se comparte en todas las filas.
    let comprobanteUrl: string | null = null;
    let warning: string | undefined;
    const file = form.get("file");
    if (file instanceof File && file.size > 0 && cobros.length > 0) {
      // Nunca dejar que un problema del comprobante parezca que el cobro no se
      // registró: a esta altura ya está guardado. Si algo falla acá, se avisa
      // diciendo exactamente eso, con el motivo.
      try {
        const supabase = await createServiceRoleClientForEmpresa(auth.empresaId);
        await ensureCobrosComprobantesBucket(supabase);
        const path = buildCobroComprobantePath(auth.empresaId, cobros[0].id, file.type);
        const buf = Buffer.from(await file.arrayBuffer());
        const up = await supabase.storage.from(COBROS_COMPROBANTES_BUCKET).upload(path, buf, { contentType: file.type, upsert: true });
        if (up.error) {
          warning = `El cobro quedó registrado, pero no se pudo guardar el comprobante: ${up.error.message}. Adjuntalo desde Conciliación bancaria.`;
        } else {
          for (const c of cobros) await updateComprobantePath(schema, auth.empresaId, c.id, path, file.type);
          comprobanteUrl = await signCobroComprobante(supabase, path, 3600);
        }
      } catch (e) {
        warning = `El cobro quedó registrado, pero no se pudo guardar el comprobante: ${motivoDelError(e)}. Adjuntalo desde Conciliación bancaria.`;
      }
    }

    // UN solo aviso para toda la transferencia (best-effort).
    await notificarCobroPendiente(auth.empresaId, {
      actorId: auth.usuarioCatalogId ?? null,
      clienteId: cobros[0]?.cliente_id ?? null,
      cobros: cobros.map((c) => ({ cobroId: c.id, facturaId: c.factura_id ?? null, monto: Number(c.monto) || 0 })),
    });

    return NextResponse.json(successResponse({ cobros, comprobante_url: comprobanteUrl, warning }));
  } catch (e) {
    if (e instanceof ConciliacionError) return NextResponse.json(errorResponse(e.message), { status: e.status });
    console.error("[/api/cobranzas/conciliacion/multiple POST]", e instanceof Error ? e.message : e);
    const motivo = motivoDelError(e);
    return NextResponse.json(
      errorResponse(motivo ? `No se pudo registrar el cobro: ${motivo}` : "No se pudo registrar el cobro."),
      { status: 500 }
    );
  }
}
