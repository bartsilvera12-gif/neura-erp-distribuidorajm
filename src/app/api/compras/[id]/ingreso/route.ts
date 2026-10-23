import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { registrarIngresoCompra } from "@/lib/compras/server/compras-pg";
import { ContabilidadError } from "@/lib/contabilidad/asientos-pg";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/compras/[id]/ingreso — ingresa al stock lo que quedó pendiente.
 * Body: { items: [{ compra_item_id, cantidad }] }
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("Compra inválida."), { status: 400 });
    const body = (await request.json().catch(() => null)) as { items?: unknown } | null;
    const items: { compra_item_id: string; cantidad: number }[] = [];
    for (const r of (Array.isArray(body?.items) ? body!.items : []) as Record<string, unknown>[]) {
      const itemId = String(r?.compra_item_id ?? "");
      const cantidad = Number(r?.cantidad);
      if (!UUID_RE.test(itemId) || !Number.isFinite(cantidad) || cantidad < 0) {
        return NextResponse.json(errorResponse("Hay una cantidad inválida."), { status: 400 });
      }
      if (cantidad > 0) items.push({ compra_item_id: itemId, cantidad });
    }
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const out = await registrarIngresoCompra(schema, ctx.auth.empresa_id, id, items, {
      usuario: ctx.auth.user?.email ?? null,
      createdBy: ctx.auth.usuarioCatalogId ?? null,
    });
    return NextResponse.json(successResponse(out));
  } catch (e) {
    if (e instanceof ContabilidadError) return NextResponse.json(errorResponse(e.message), { status: e.status });
    console.error("[/api/compras/[id]/ingreso]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo registrar el ingreso."), { status: 500 });
  }
}
