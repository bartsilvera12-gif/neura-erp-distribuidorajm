import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/inventario/stock-historico?fecha=YYYY-MM-DD
 *
 * Reconstruye el stock de cada producto AL INICIO del día pedido, sin usar
 * una tabla de snapshots. La fórmula:
 *
 *   stock(fecha) = stock_actual
 *                  − Σ ENTRADAS con fecha >= `fecha`
 *                  + Σ SALIDAS   con fecha >= `fecha`
 *                  − Σ AJUSTES   con fecha >= `fecha`   (ajuste trae signo
 *                                                      en cantidad)
 *
 * Es una aproximación: si existen movimientos no registrados en
 * `movimientos_inventario` (por ejemplo transferencias camión↔salón que
 * viven en `reparto_stock`), el stock histórico va a diferir del real.
 * Por eso se declara como "estimación" en la UI. Pedido explícito de
 * Distribuidora JM (soporte, punto 9).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

    const sp = request.nextUrl.searchParams;
    const fecha = (sp.get("fecha") ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return NextResponse.json(errorResponse("Falta o es inválida la fecha (YYYY-MM-DD)."), { status: 400 });
    }

    const tP = quoteSchemaTable(schema, "productos");
    const tM = quoteSchemaTable(schema, "movimientos_inventario");

    // Si la tabla de movimientos no existe, no podemos reconstruir.
    const existe = await queryWithRetry<{ t: string | null }>(
      pool, `SELECT to_regclass($1)::text AS t`, [`${schema}.movimientos_inventario`]
    );
    if (!existe.rows[0]?.t) {
      return NextResponse.json(
        errorResponse("Este tenant no tiene historial de movimientos: no se puede reconstruir el stock pasado."),
        { status: 409 }
      );
    }

    const { rows } = await queryWithRetry<{
      id: string;
      nombre: string;
      sku: string;
      unidad_medida: string | null;
      ubicacion_principal_id: string | null;
      stock_actual: string;
      stock_historico: string;
    }>(
      pool,
      `WITH ajustes AS (
         SELECT m.producto_id,
                COALESCE(sum(CASE WHEN m.tipo = 'ENTRADA' THEN m.cantidad ELSE 0 END), 0) AS entradas,
                COALESCE(sum(CASE WHEN m.tipo = 'SALIDA'  THEN m.cantidad ELSE 0 END), 0) AS salidas,
                COALESCE(sum(CASE WHEN m.tipo = 'AJUSTE'  THEN m.cantidad ELSE 0 END), 0) AS ajustes
           FROM ${tM} m
          WHERE m.empresa_id = $1::uuid
            AND m.fecha >= $2::date
          GROUP BY m.producto_id
       )
       SELECT p.id, p.nombre, p.sku, p.unidad_medida, p.ubicacion_principal_id,
              p.stock_actual::text AS stock_actual,
              (
                COALESCE(p.stock_actual, 0)
                - COALESCE(a.entradas, 0)
                + COALESCE(a.salidas,  0)
                - COALESCE(a.ajustes,  0)
              )::text AS stock_historico
         FROM ${tP} p
         LEFT JOIN ajustes a ON a.producto_id = p.id
        WHERE p.empresa_id = $1::uuid AND p.activo = true
        ORDER BY p.nombre`,
      [empresaId, fecha]
    );

    return NextResponse.json(successResponse({
      fecha,
      total: rows.length,
      filas: rows.map((r) => ({
        producto_id: r.id,
        nombre: r.nombre,
        sku: r.sku,
        unidad_medida: r.unidad_medida,
        ubicacion_principal_id: r.ubicacion_principal_id,
        stock_actual: Number(r.stock_actual) || 0,
        stock_historico: Number(r.stock_historico) || 0,
      })),
    }));
  } catch (err) {
    console.error("[/api/inventario/stock-historico GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo reconstruir el stock."), { status: 500 });
  }
}
