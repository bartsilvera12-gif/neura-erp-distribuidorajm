import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { queryWithRetry } from "@/lib/supabase/pg-retry";

/**
 * GET /api/inventario/movimientos — lista movimientos via PG directo.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const schemaRaw = await fetchDataSchemaForEmpresaId(empresaId);
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });
    const t = quoteSchemaTable(schema, "movimientos_inventario");
    const tP = quoteSchemaTable(schema, "productos");
    // `producto_nombre`/`producto_sku` en el movimiento son una foto tomada al
    // registrarlo: no cambian si después se edita el producto. Para que el
    // historial muestre el nombre y SKU ACTUALES (el cliente cambió el código y
    // acá seguía el viejo), se trae del producto por su id, y solo se cae a la
    // foto si el producto ya no existe.
    const { rows } = await queryWithRetry(pool,
      `SELECT m.id, m.empresa_id, m.producto_id,
              COALESCE(p.nombre, m.producto_nombre) AS producto_nombre,
              COALESCE(p.sku, m.producto_sku) AS producto_sku,
              m.tipo, m.cantidad, m.costo_unitario, m.origen, m.referencia, m.fecha,
              m.created_at, m.updated_at, m.created_by, m.usuario_nombre
         FROM ${t} m
         LEFT JOIN ${tP} p ON p.id = m.producto_id AND p.empresa_id = m.empresa_id
        WHERE m.empresa_id = $1::uuid
        ORDER BY m.fecha DESC
        LIMIT 500`,
      [empresaId]
    );
    return NextResponse.json(successResponse({ movimientos: rows }));
  } catch (err) {
    console.error("[/api/inventario/movimientos GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los movimientos."), { status: 500 });
  }
}
