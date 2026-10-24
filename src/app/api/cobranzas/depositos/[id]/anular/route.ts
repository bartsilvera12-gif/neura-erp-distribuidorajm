import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { anularDeposito, ReciboError } from "@/lib/cobranzas/server/recibos-pg";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/cobranzas/depositos/[id]/anular — solo si todavía no se usó. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("Depósito inválido."), { status: 400 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    await anularDeposito(pool, schema, ctx.auth.empresa_id, id);
    return NextResponse.json(successResponse({ anulado: true }));
  } catch (e) {
    if (e instanceof ReciboError) return NextResponse.json(errorResponse(e.message), { status: e.status });
    console.error("[/api/cobranzas/depositos/[id]/anular]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo anular el depósito."), { status: 500 });
  }
}
