import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  crearEmpaque,
  EmpaqueError,
  empaquesPorProducto,
  hayEmpaques,
  leerEmpaqueInput,
} from "@/lib/inventario/server/empaques-pg";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/productos/[id]/empaques — las cajas del producto. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("Producto inválido."), { status: 400 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const disponible = await hayEmpaques(pool, schema);
    const m = await empaquesPorProducto(pool, schema, ctx.auth.empresa_id, [id]);
    return NextResponse.json(successResponse({ disponible, empaques: m.get(id) ?? [] }));
  } catch (e) {
    console.error("[/api/productos/[id]/empaques GET]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudieron leer las cajas."), { status: 500 });
  }
}

/** POST /api/productos/[id]/empaques — { nombre, factor, precio_venta, codigo_barras }. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("Producto inválido."), { status: 400 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const e = await crearEmpaque(pool, schema, ctx.auth.empresa_id, id, leerEmpaqueInput(b));
    return NextResponse.json(successResponse({ empaque: e }));
  } catch (e) {
    if (e instanceof EmpaqueError) return NextResponse.json(errorResponse(e.message), { status: e.status });
    console.error("[/api/productos/[id]/empaques POST]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo guardar la caja."), { status: 500 });
  }
}
