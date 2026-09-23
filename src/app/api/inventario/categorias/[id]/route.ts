import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { updateCategoriaProducto } from "@/lib/inventario/server/catalogos-pg";
import { CatalogoEnUsoError, deleteCategoriaProducto } from "@/lib/inventario/server/catalogos-pg";
import { normalizeUpperText, normalizeUpperNullable } from "@/lib/text/normalize";

export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Parameters<typeof updateCategoriaProducto>[3] = {};
    if (body.nombre !== undefined) patch.nombre = normalizeUpperText(body.nombre);
    if (body.codigo !== undefined) patch.codigo = normalizeUpperNullable(body.codigo);
    if (body.descripcion !== undefined) patch.descripcion = normalizeUpperNullable(body.descripcion);
    if (body.parent_id !== undefined) patch.parent_id = body.parent_id == null ? null : String(body.parent_id);
    if (body.activo !== undefined) patch.activo = body.activo === true;
    const row = await updateCategoriaProducto(schema, ctx.auth.empresa_id, id, patch);
    if (!row) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    return NextResponse.json(successResponse({ categoria: row }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/uq_categorias_productos_empresa_nombre|duplicate/i.test(msg)) {
      return NextResponse.json(errorResponse("Ya existe una categoría con ese nombre."), { status: 409 });
    }
    console.error("[/api/inventario/categorias/[id] PATCH]", err);
    return NextResponse.json(errorResponse("No se pudo actualizar la categoría."), { status: 500 });
  }
}

/**
 * DELETE — borra la categoría. Se niega, con el motivo, si está en uso:
 * borrarla dejaría datos apuntando a algo que ya no existe.
 */
export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const ok = await deleteCategoriaProducto(schema, ctx.auth.empresa_id, id);
    if (!ok) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    if (err instanceof CatalogoEnUsoError) {
      return NextResponse.json(errorResponse(err.message), { status: err.status });
    }
    const msg = err instanceof Error ? err.message : "";
    console.error("[/api/inventario/categorias/[id] DELETE]", err);
    return NextResponse.json(
      errorResponse(msg ? `No se pudo borrar la categoría: ${msg}` : "No se pudo borrar la categoría."),
      { status: 500 }
    );
  }
}
