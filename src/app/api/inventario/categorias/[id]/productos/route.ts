import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { listProductosDeCategoria } from "@/lib/inventario/server/catalogos-pg";

/**
 * GET /api/inventario/categorias/[id]/productos
 *
 * Los productos activos que tienen esta categoría como principal. Lo usa la
 * pantalla de Categorías para mostrar, al tocar una categoría, todo lo que cae
 * ahí.
 */
export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const productos = await listProductosDeCategoria(schema, ctx.auth.empresa_id, id);
    return NextResponse.json(successResponse({ productos }));
  } catch (err) {
    console.error("[/api/inventario/categorias/[id]/productos GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los productos de la categoría."), { status: 500 });
  }
}
