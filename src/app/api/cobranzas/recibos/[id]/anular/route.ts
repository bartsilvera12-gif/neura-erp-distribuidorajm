import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresa } from "@/lib/modulos/resolve-effective-modules";
import { anularCobro, ReciboError } from "@/lib/cobranzas/server/recibos-pg";
import { sincronizarFacturaDeVenta } from "@/lib/cobranzas/server/sincronizar-factura";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/cobranzas/recibos/[id]/anular — { motivo } — anula el cobro de
 * una venta a crédito. Solo el administrador.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresa(ctx.auth.rol)) {
      return NextResponse.json(errorResponse("Solo el administrador puede anular un cobro."), { status: 403 });
    }
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("Recibo inválido."), { status: 400 });
    const b = (await request.json().catch(() => ({}))) as { motivo?: unknown };
    const motivo = String(b.motivo ?? "").trim().slice(0, 300);
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const r = await anularCobro(pool, schema, ctx.auth.empresa_id, id, {
      usuario: ctx.auth.user?.email ?? null,
      motivo,
    });
    // La factura de esa venta vuelve a tener saldo (y a figurar pendiente).
    if (r.ventaId) await sincronizarFacturaDeVenta(pool, schema, ctx.auth.empresa_id, r.ventaId);
    return NextResponse.json(successResponse({ anulado: true, numero: r.numero }));
  } catch (e) {
    if (e instanceof ReciboError) return NextResponse.json(errorResponse(e.message), { status: e.status });
    console.error("[/api/cobranzas/recibos/[id]/anular]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo anular el cobro."), { status: 500 });
  }
}
