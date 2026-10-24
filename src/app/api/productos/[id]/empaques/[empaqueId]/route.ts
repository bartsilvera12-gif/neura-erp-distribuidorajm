import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { actualizarEmpaque, borrarEmpaque, EmpaqueError, leerEmpaqueInput } from "@/lib/inventario/server/empaques-pg";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { params: Promise<{ id: string; empaqueId: string }> };

async function base(request: NextRequest, context: Ctx) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return { error: NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 }) };
  const pool = getChatPostgresPool();
  if (!pool) return { error: NextResponse.json(errorResponse("Pool no disponible."), { status: 500 }) };
  const { id, empaqueId } = await context.params;
  if (!UUID_RE.test(id) || !UUID_RE.test(empaqueId)) {
    return { error: NextResponse.json(errorResponse("Caja inválida."), { status: 400 }) };
  }
  const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
  return { pool, schema, empresaId: ctx.auth.empresa_id, id, empaqueId };
}

/** PATCH /api/productos/[id]/empaques/[empaqueId] */
export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const r = await base(request, context);
    if ("error" in r) return r.error;
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const e = await actualizarEmpaque(r.pool, r.schema, r.empresaId, r.id, r.empaqueId, leerEmpaqueInput(b));
    return NextResponse.json(successResponse({ empaque: e }));
  } catch (e) {
    if (e instanceof EmpaqueError) return NextResponse.json(errorResponse(e.message), { status: e.status });
    console.error("[/api/productos/[id]/empaques/[empaqueId] PATCH]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo guardar la caja."), { status: 500 });
  }
}

/** DELETE /api/productos/[id]/empaques/[empaqueId] */
export async function DELETE(request: NextRequest, context: Ctx) {
  try {
    const r = await base(request, context);
    if ("error" in r) return r.error;
    await borrarEmpaque(r.pool, r.schema, r.empresaId, r.id, r.empaqueId);
    return NextResponse.json(successResponse({ ok: true }));
  } catch (e) {
    if (e instanceof EmpaqueError) return NextResponse.json(errorResponse(e.message), { status: e.status });
    console.error("[/api/productos/[id]/empaques/[empaqueId] DELETE]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo quitar la caja."), { status: 500 });
  }
}
