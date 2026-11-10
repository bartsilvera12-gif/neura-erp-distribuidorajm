import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

type ItemDeVenta = { producto: string; cantidad: number; empaque: string | null };

/**
 * GET /api/ventas/items?numero=VTA-002261 — qué se llevó en esa venta.
 *
 * Para el recibo de dinero: el cliente quiere ver en concepto de qué paga
 * («3 cajas de pollo…»), no solo el número de la venta.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const numero = (request.nextUrl.searchParams.get("numero") ?? "").trim();
    if (!numero || numero.length > 40) return NextResponse.json(errorResponse("Falta el número de venta."), { status: 400 });
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });
    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));

    const cols = await pool.query<{ c: string }>(
      `SELECT column_name AS c FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'ventas_items'`,
      [schema]
    );
    const conEmpaque = cols.rows.some((r) => r.c === "empaque_nombre");
    const { rows } = await pool.query<{ producto: string; cantidad: string; empaque: string | null }>(
      `SELECT COALESCE(NULLIF(btrim(vi.producto_nombre), ''), 'Producto') AS producto,
              vi.cantidad::text AS cantidad,
              ${conEmpaque ? "NULLIF(btrim(vi.empaque_nombre), '')" : "NULL::text"} AS empaque
         FROM ${quoteSchemaTable(schema, "ventas_items")} vi
         JOIN ${quoteSchemaTable(schema, "ventas")} v ON v.id = vi.venta_id
        WHERE v.empresa_id = $1::uuid AND v.numero_control = $2
        ORDER BY vi.producto_nombre`,
      [empresaId, numero]
    );
    const items: ItemDeVenta[] = rows.map((r) => ({ producto: r.producto, cantidad: Number(r.cantidad), empaque: r.empaque }));
    return NextResponse.json(successResponse({ items }));
  } catch (e) {
    console.error("[/api/ventas/items]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudieron leer los productos de la venta."), { status: 500 });
  }
}
