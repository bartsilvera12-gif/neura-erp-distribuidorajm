import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { numeroRecibo, ReciboError, registrarDeposito } from "@/lib/cobranzas/server/recibos-pg";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEDIOS = new Set(["efectivo", "transferencia", "cheque", "tarjeta", "otro"]);

/**
 * POST /api/cobranzas/depositos — el cliente deja plata a cuenta.
 * Body: { cliente_id, monto, medio_pago, referencia?, observaciones? }
 * Queda como recibo de dinero (tipo depósito), sin tocar la caja.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const clienteId = String(b.cliente_id ?? "");
    if (!UUID_RE.test(clienteId)) return NextResponse.json(errorResponse("Elegí el cliente."), { status: 400 });
    const monto = Math.round(Number(b.monto));
    if (!Number.isFinite(monto) || monto <= 0) {
      return NextResponse.json(errorResponse("Poné el monto del depósito."), { status: 400 });
    }
    const medio = String(b.medio_pago ?? "efectivo").toLowerCase();
    if (!MEDIOS.has(medio)) return NextResponse.json(errorResponse("Forma de pago inválida."), { status: 400 });
    const txt = (v: unknown) => String(v ?? "").trim().slice(0, 300) || null;

    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const r = await registrarDeposito(pool, schema, ctx.auth.empresa_id, {
      clienteId,
      monto,
      medioPago: medio,
      referencia: txt(b.referencia),
      observaciones: txt(b.observaciones),
      usuario: ctx.auth.user?.email ?? null,
    });
    return NextResponse.json(successResponse({ ...r, recibo_numero: numeroRecibo(r.numero) }));
  } catch (e) {
    if (e instanceof ReciboError) return NextResponse.json(errorResponse(e.message), { status: e.status });
    console.error("[/api/cobranzas/depositos POST]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo registrar el depósito."), { status: 500 });
  }
}
