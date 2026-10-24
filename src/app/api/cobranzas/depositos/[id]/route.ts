import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getDeposito, numeroRecibo, ReciboError } from "@/lib/cobranzas/server/recibos-pg";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/cobranzas/depositos/[id] — el depósito con su saldo (para la caja). */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("Depósito inválido."), { status: 400 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const d = await getDeposito(pool, schema, ctx.auth.empresa_id, id);
    if (!d) return NextResponse.json(errorResponse("El depósito no existe."), { status: 404 });
    return NextResponse.json(successResponse({ ...d, recibo_numero: numeroRecibo(d.numero) }));
  } catch (e) {
    if (e instanceof ReciboError) return NextResponse.json(errorResponse(e.message), { status: e.status });
    console.error("[/api/cobranzas/depositos/[id]]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo leer el depósito."), { status: 500 });
  }
}
