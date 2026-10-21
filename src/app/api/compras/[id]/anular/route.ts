import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { anularCompra } from "@/lib/compras/server/compras-pg";
import { ContabilidadError } from "@/lib/contabilidad/asientos-pg";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/compras/[id]/anular — anula la compra y devuelve el stock que entró. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("Compra inválida."), { status: 400 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    await anularCompra(schema, ctx.auth.empresa_id, id, {
      usuario: ctx.auth.user?.email ?? null,
      createdBy: ctx.auth.usuarioCatalogId ?? null,
    });
    return NextResponse.json(successResponse({ anulada: true }));
  } catch (e) {
    if (e instanceof ContabilidadError) return NextResponse.json(errorResponse(e.message), { status: e.status });
    console.error("[/api/compras/[id]/anular]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo anular la compra."), { status: 500 });
  }
}
