import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/reportes/ranking-clientes
 *
 * Tres vistas sobre los clientes, cubriendo el punto 6 del soporte de
 * Distribuidora JM:
 *
 *   vista=top         Clientes con más ventas en el período (desde/hasta).
 *                     Devuelve nombre, cantidad de operaciones y monto total
 *                     (ventas no anuladas). Default: últimos 90 días.
 *
 *   vista=morosos     Clientes con ventas a crédito cuyo plazo venció y
 *                     siguen con saldo pendiente. Parámetro `mora_min` (días,
 *                     default 1) filtra los de mora >= N; `mora_min=8` cubre
 *                     el pedido explícito de la clienta.
 *
 *   vista=inactivos   Clientes que NO compraron en los últimos N días (default
 *                     60). Se listan con fecha de última compra y días desde
 *                     esa fecha.
 *
 * Parámetros comunes: limit (default 100, max 1000).
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
    const vista = sp.get("vista") === "morosos" ? "morosos"
      : sp.get("vista") === "inactivos" ? "inactivos"
      : "top";
    const limit = Math.max(1, Math.min(1000, Number(sp.get("limit")) || 100));

    const tV = quoteSchemaTable(schema, "ventas");
    const tC = quoteSchemaTable(schema, "clientes");

    // Columnas de la tabla clientes pueden variar entre tenants: armamos el
    // expr de nombre de forma defensiva (igual que hace /api/ventas).
    const colsQ = await queryWithRetry<{ c: string }>(
      pool,
      `SELECT column_name AS c FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'clientes'`,
      [schema]
    );
    const hay = new Set(colsQ.rows.map((r) => r.c));
    const partes = ["empresa", "nombre_contacto", "razon_social", "nombre"]
      .filter((c) => hay.has(c))
      .map((c) => `NULLIF(btrim(cl.${c}), '')`);
    const exprNombre = partes.length === 0
      ? `'Cliente'`
      : hay.has("tipo_cliente") && hay.has("nombre_contacto")
        ? `CASE WHEN lower(coalesce(cl.tipo_cliente,'')) = 'persona'
                THEN COALESCE(NULLIF(btrim(cl.nombre_contacto), ''), ${partes.join(", ")}, 'Cliente')
                ELSE COALESCE(${partes.join(", ")}, 'Cliente') END`
        : `COALESCE(${partes.join(", ")}, 'Cliente')`;
    const exprRuc = ["ruc_factura", "ruc", "documento"].filter((c) => hay.has(c)).length > 0
      ? `COALESCE(${["ruc_factura", "ruc", "documento"].filter((c) => hay.has(c)).map((c) => `NULLIF(btrim(cl.${c}), '')`).join(", ")})`
      : `NULL::text`;

    if (vista === "top") {
      const desde = (sp.get("desde") ?? "").trim();
      const hasta = (sp.get("hasta") ?? "").trim();
      const cond: string[] = [];
      const params: unknown[] = [empresaId];
      if (/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
        params.push(desde);
        cond.push(`v.fecha >= $${params.length}::date`);
      } else if (!hasta) {
        cond.push(`v.fecha >= now() - interval '90 days'`);
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
        params.push(hasta);
        cond.push(`v.fecha < ($${params.length}::date + interval '1 day')`);
      }

      const sql = `
        SELECT cl.id AS cliente_id,
               ${exprNombre} AS nombre,
               ${exprRuc} AS ruc,
               count(v.id)::text AS operaciones,
               sum(v.total)::text AS total
          FROM ${tV} v
          JOIN ${tC} cl ON cl.id = v.cliente_id
         WHERE v.empresa_id = $1::uuid
           AND COALESCE(v.estado, '') <> 'anulada'
           AND v.cliente_id IS NOT NULL
           ${cond.map((c) => "AND " + c).join(" ")}
         GROUP BY cl.id, nombre, ruc
         ORDER BY sum(v.total) DESC NULLS LAST
         LIMIT ${limit}`;
      const { rows } = await queryWithRetry<Record<string, string>>(pool, sql, params);
      return NextResponse.json(successResponse({
        vista: "top",
        filas: rows.map((r) => ({
          cliente_id: r.cliente_id,
          nombre: r.nombre,
          ruc: r.ruc,
          operaciones: Number(r.operaciones) || 0,
          total: Number(r.total) || 0,
        })),
      }));
    }

    if (vista === "morosos") {
      const moraMin = Math.max(0, Number(sp.get("mora_min")) || 1);
      // Reusamos la lógica de /api/cobranzas/credito: saldo = total − cobrado.
      // Para no hacer un join ultra pesado, agrupamos directo las facturas
      // crédito por cliente y descontamos los pagos. Usamos pagos.monto si
      // la tabla existe.
      const tienePagos = (
        await queryWithRetry<{ t: string | null }>(
          pool, `SELECT to_regclass($1)::text AS t`, [`${schema}.pagos`]
        )
      ).rows[0]?.t !== null;

      // Vencimiento = fecha + plazo_dias. Dias de mora = hoy - vencimiento.
      const sql = `
        WITH pagado AS (
          ${tienePagos
            ? `SELECT p.factura_id, sum(p.monto)::numeric AS cob
                 FROM ${quoteSchemaTable(schema, "pagos")} p
                WHERE p.empresa_id = $1::uuid
                  AND COALESCE(p.estado_contable, '') <> 'revertido'
                GROUP BY p.factura_id`
            : `SELECT NULL::uuid AS factura_id, 0::numeric AS cob WHERE false`
          }
        ),
        ventas_credito AS (
          SELECT v.cliente_id,
                 v.id,
                 v.total::numeric AS total,
                 (v.fecha::date + COALESCE(v.plazo_dias, 0)) AS vencimiento,
                 EXTRACT(DAY FROM (now() - (v.fecha + COALESCE(v.plazo_dias, 0) * interval '1 day')))::int AS dias
            FROM ${tV} v
           WHERE v.empresa_id = $1::uuid
             AND COALESCE(v.estado, '') <> 'anulada'
             AND v.tipo_venta = 'CREDITO'
             AND v.cliente_id IS NOT NULL
        ),
        saldos AS (
          SELECT vc.cliente_id,
                 vc.id,
                 vc.total,
                 vc.vencimiento,
                 vc.dias,
                 vc.total - COALESCE(p.cob, 0) AS saldo
            FROM ventas_credito vc
            LEFT JOIN pagado p ON p.factura_id = vc.id
        )
        SELECT cl.id AS cliente_id,
               ${exprNombre} AS nombre,
               ${exprRuc} AS ruc,
               sum(s.saldo)::text AS saldo_total,
               sum(CASE WHEN s.dias > 0 THEN s.saldo ELSE 0 END)::text AS vencido,
               count(DISTINCT s.id)::text AS facturas,
               max(s.dias)::text AS dias_mora_max
          FROM saldos s
          JOIN ${tC} cl ON cl.id = s.cliente_id
         WHERE s.saldo > 0.5
         GROUP BY cl.id, nombre, ruc
        HAVING max(s.dias) >= $2::int
         ORDER BY max(s.dias) DESC, sum(s.saldo) DESC
         LIMIT ${limit}`;
      const { rows } = await queryWithRetry<Record<string, string>>(pool, sql, [empresaId, moraMin]);
      return NextResponse.json(successResponse({
        vista: "morosos",
        mora_min: moraMin,
        filas: rows.map((r) => ({
          cliente_id: r.cliente_id,
          nombre: r.nombre,
          ruc: r.ruc,
          facturas: Number(r.facturas) || 0,
          saldo_total: Number(r.saldo_total) || 0,
          vencido: Number(r.vencido) || 0,
          dias_mora_max: Number(r.dias_mora_max) || 0,
        })),
      }));
    }

    // vista = inactivos
    const inactivoDesdeDias = Math.max(1, Number(sp.get("desde_dias")) || 60);
    const sql = `
      WITH ultimas AS (
        SELECT v.cliente_id, max(v.fecha) AS ultima
          FROM ${tV} v
         WHERE v.empresa_id = $1::uuid
           AND COALESCE(v.estado, '') <> 'anulada'
           AND v.cliente_id IS NOT NULL
         GROUP BY v.cliente_id
      )
      SELECT cl.id AS cliente_id,
             ${exprNombre} AS nombre,
             ${exprRuc} AS ruc,
             u.ultima::text AS ultima_compra,
             EXTRACT(DAY FROM (now() - u.ultima))::int AS dias_sin_comprar
        FROM ultimas u
        JOIN ${tC} cl ON cl.id = u.cliente_id
       WHERE EXTRACT(DAY FROM (now() - u.ultima)) >= $2::int
       ORDER BY u.ultima ASC
       LIMIT ${limit}`;
    const { rows } = await queryWithRetry<Record<string, string>>(pool, sql, [empresaId, inactivoDesdeDias]);
    return NextResponse.json(successResponse({
      vista: "inactivos",
      desde_dias: inactivoDesdeDias,
      filas: rows.map((r) => ({
        cliente_id: r.cliente_id,
        nombre: r.nombre,
        ruc: r.ruc,
        ultima_compra: r.ultima_compra,
        dias_sin_comprar: Number(r.dias_sin_comprar) || 0,
      })),
    }));
  } catch (err) {
    console.error("[/api/reportes/ranking-clientes GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo generar el ranking."), { status: 500 });
  }
}
