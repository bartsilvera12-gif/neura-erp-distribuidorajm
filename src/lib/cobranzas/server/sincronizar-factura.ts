import "server-only";
import type { Pool } from "pg";
import { quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * Pone al día el saldo y el estado de la factura de una venta a crédito.
 *
 * La deuda de una venta a crédito se cobra en Cobranzas (ingresos de caja con
 * recibo), pero la factura guardaba su propio saldo y nadie se lo bajaba: el
 * cliente pagaba, tenía recibo, y la factura seguía "Pendiente" en Gestión de
 * clientes. Acá el saldo de la factura pasa a ser lo que de verdad falta:
 *
 *   saldo = monto de la factura − pagos cargados a la factura − cobros de caja de la venta
 *
 * Sin saldo queda "Pagado"; si se anuló un cobro y vuelve a deber, vuelve a
 * "Pendiente". No toca facturas anuladas, corregidas con nota de crédito ni
 * condonadas. Nunca tira: si algo falla, el cobro ya está hecho igual.
 */
export async function sincronizarFacturaDeVenta(
  pool: Pool,
  schemaRaw: string,
  empresaId: string,
  ventaId: string
): Promise<void> {
  try {
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const ex = await pool.query<{ f: string | null; m: string | null; p: string | null; col: boolean }>(
      `SELECT to_regclass($1)::text AS f, to_regclass($2)::text AS m, to_regclass($3)::text AS p,
              EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = $4 AND table_name = 'ventas' AND column_name = 'factura_id') AS col`,
      [`${schema}.facturas`, `${schema}.caja_movimientos`, `${schema}.pagos`, schema]
    );
    const e = ex.rows[0];
    if (!e?.f || !e.m || !e.col) return;

    const tF = quoteSchemaTable(schema, "facturas");
    const tV = quoteSchemaTable(schema, "ventas");
    const tM = quoteSchemaTable(schema, "caja_movimientos");
    const pagos = e.p
      ? `COALESCE((SELECT sum(pg.monto) FROM ${quoteSchemaTable(schema, "pagos")} pg WHERE pg.factura_id = f.id), 0)`
      : "0";

    await pool.query(
      `WITH nuevo AS (
         SELECT f.id,
                GREATEST(f.monto - ${pagos}
                  - COALESCE((SELECT sum(m.monto) FROM ${tM} m
                               WHERE m.venta_id = v.id AND m.tipo = 'ingreso' AND m.anulado_at IS NULL), 0), 0) AS saldo
           FROM ${tF} f JOIN ${tV} v ON v.factura_id = f.id
          WHERE v.id = $1::uuid AND v.empresa_id = $2::uuid AND f.empresa_id = $2::uuid
            AND v.tipo_venta = 'CREDITO'
            AND f.estado NOT IN ('Anulado', 'Corregida NC')
            AND (to_jsonb(f)->>'condonacion_tipo') IS NULL
       )
       UPDATE ${tF} f
          SET saldo = n.saldo,
              estado = CASE WHEN n.saldo <= 0.5 THEN 'Pagado'
                            WHEN f.estado = 'Pagado' THEN 'Pendiente'
                            ELSE f.estado END,
              updated_at = now()
         FROM nuevo n
        WHERE f.id = n.id AND (f.saldo IS DISTINCT FROM n.saldo OR (n.saldo <= 0.5) <> (f.estado = 'Pagado'))`,
      [ventaId, empresaId]
    );
  } catch (err) {
    console.error("[sincronizarFacturaDeVenta]", err instanceof Error ? err.message : err);
  }
}
