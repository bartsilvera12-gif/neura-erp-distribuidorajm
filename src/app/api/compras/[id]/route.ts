import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth, getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { esRolAdminEmpresa } from "@/lib/modulos/resolve-effective-modules";
import { ContabilidadError } from "@/lib/contabilidad/asientos-pg";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { borrarCompra, getCompraDetalle, updateCompraCuentaContable } from "@/lib/compras/server/compras-pg";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/compras/[id] — los productos de la compra y a dónde entraron. */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("Compra inválida."), { status: 400 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const detalle = await getCompraDetalle(schema, ctx.auth.empresa_id, id);
    return NextResponse.json(successResponse(detalle));
  } catch (err) {
    console.error("[/api/compras/[id] GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo leer la compra."), { status: 500 });
  }
}

/**
 * PATCH /api/compras/[id] — edición ACOTADA: solo la cuenta contable asociada.
 * No toca proveedor, producto, montos ni el impacto en inventario ya generado.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await context.params;
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (!("cuenta_contable_id" in body)) {
      return NextResponse.json(errorResponse("No hay cambios para aplicar."), { status: 400 });
    }
    const raw = body.cuenta_contable_id;
    const cuentaContableId = raw == null || String(raw).trim() === "" ? null : String(raw);

    try {
      const compra = await updateCompraCuentaContable(schema, ctx.auth.empresa_id, id, cuentaContableId);
      if (!compra) return NextResponse.json(errorResponse("Compra no encontrada."), { status: 404 });
      return NextResponse.json(successResponse({ compra }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo actualizar la compra.";
      const code = (e as { code?: string })?.code;
      if (code === "23503") {
        return NextResponse.json(errorResponse("La cuenta contable seleccionada no existe."), { status: 400 });
      }
      return NextResponse.json(errorResponse(msg), { status: 400 });
    }
  } catch (err) {
    console.error("[/api/compras/[id] PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo actualizar la compra."), { status: 500 });
  }
}

/** DELETE /api/compras/[id] — borra la compra (solo administradores). */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresa(ctx.auth.rol)) {
      return NextResponse.json(errorResponse("Solo un administrador puede borrar compras."), { status: 403 });
    }
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("Compra inválida."), { status: 400 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const r = await borrarCompra(schema, ctx.auth.empresa_id, id, {
      usuario: ctx.auth.user?.email ?? null,
      createdBy: ctx.auth.usuarioCatalogId ?? null,
    });
    return NextResponse.json(successResponse({ borrada: true, numero: r.numero }));
  } catch (e) {
    if (e instanceof ContabilidadError) return NextResponse.json(errorResponse(e.message), { status: e.status });
    console.error("[/api/compras/[id] DELETE]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo borrar la compra."), { status: 500 });
  }
}
