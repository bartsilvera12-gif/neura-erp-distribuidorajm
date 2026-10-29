import { NextRequest, NextResponse } from "next/server";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { requireCobranzasApiAccess } from "@/lib/contabilidad/contabilidad-auth";
import { registrarEfectivoMultiple, CobroEfectivoError } from "@/lib/cobranzas/cobro-efectivo-pg";
import { ContabilidadError } from "@/lib/contabilidad/asientos-pg";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const s = (v: unknown) => (v == null ? "" : String(v).trim());

/**
 * POST (JSON) — cobro en EFECTIVO de una o varias facturas del cliente, INMEDIATO.
 *
 * No pasa por Conciliación bancaria: la plata ya está en mano, así que baja el
 * saldo al instante (y asienta contra Caja si hay contabilidad). Mismo permiso
 * que aprobar una transferencia (Cobranzas / Pagos / Contabilidad o admin),
 * porque el efecto es equivalente: mueve plata y toca el saldo en firme.
 *
 * Campos: fecha, referencia (opcional), items = [{ factura_id, monto }].
 */
export async function POST(request: NextRequest) {
  const auth = await requireCobranzasApiAccess(request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });
  try {
    const schema = await fetchDataSchemaForEmpresaId(auth.empresaId);

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(errorResponse("Body JSON inválido."), { status: 400 });
    }

    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items = rawItems
      .map((r) => {
        const o = (r ?? {}) as Record<string, unknown>;
        return { factura_id: s(o.factura_id), monto: Number(o.monto) || 0 };
      })
      .filter((it) => UUID_RE.test(it.factura_id) && it.monto > 0);
    if (items.length === 0) {
      return NextResponse.json(errorResponse("Seleccioná al menos una factura con monto."), { status: 400 });
    }

    const cobros = await registrarEfectivoMultiple(schema, auth.empresaId, {
      fecha: s(body.fecha) || new Date().toISOString().slice(0, 10),
      referencia: s(body.referencia) || null,
      created_by: auth.usuarioCatalogId ?? null,
      items,
    });

    return NextResponse.json(successResponse({ cobros }));
  } catch (e) {
    if (e instanceof CobroEfectivoError) return NextResponse.json(errorResponse(e.message), { status: e.status });
    if (e instanceof ContabilidadError) return NextResponse.json(errorResponse(e.message), { status: 400 });
    console.error("[/api/cobranzas/efectivo POST]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo registrar el cobro en efectivo."), { status: 500 });
  }
}
