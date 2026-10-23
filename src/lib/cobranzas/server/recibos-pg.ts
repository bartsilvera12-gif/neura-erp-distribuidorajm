import "server-only";
import type { Pool } from "pg";
import { quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * Recibos de dinero (SQL 53): cada cobro a un cliente queda con un recibo
 * numerado (REC-000001…) que se lista y se reimprime. El cobro sigue siendo
 * el ingreso de caja; el recibo lo referencia.
 */

export type Recibo = {
  id: string;
  numero: number;
  fecha: string;
  cliente_nombre: string;
  cliente_ruc: string | null;
  monto: number;
  medio_pago: string | null;
  concepto: string | null;
  venta_numero: string | null;
  saldo_restante: number | null;
  usuario_nombre: string | null;
  anulado: boolean;
};

export function numeroRecibo(n: number): string {
  return `REC-${String(n).padStart(6, "0")}`;
}

async function hayTabla(pool: Pool, schema: string): Promise<boolean> {
  const q = await pool.query<{ t: string | null }>(`SELECT to_regclass($1)::text AS t`, [`${schema}.recibos_dinero`]);
  return !!q.rows[0]?.t;
}

/** Nombre y RUC/CI del cliente, con las columnas que tenga la tabla. */
async function datosCliente(pool: Pool, schema: string, clienteId: string | null) {
  if (!clienteId) return { nombre: "Sin nombre", ruc: null as string | null };
  const q = await pool.query<{ c: Record<string, unknown> | null }>(
    `SELECT to_jsonb(c) AS c FROM ${quoteSchemaTable(schema, "clientes")} c WHERE c.id = $1::uuid`,
    [clienteId]
  );
  const c = q.rows[0]?.c ?? {};
  const txt = (k: string) => {
    const v = c[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  return {
    nombre: txt("razon_social") ?? txt("nombre") ?? txt("empresa") ?? "Sin nombre",
    ruc: txt("ruc") ?? txt("documento") ?? txt("ci"),
  };
}

/**
 * Emite el recibo del cobro de una venta a crédito. Sin el SQL 53 devuelve
 * `null` (el cobro igual queda registrado; el recibo sale sin número propio).
 */
export async function emitirReciboCobro(
  pool: Pool,
  schemaRaw: string,
  empresaId: string,
  d: {
    ventaId: string;
    ventaNumero: string;
    clienteId: string | null;
    monto: number;
    medioPago: string;
    saldoRestante: number;
    cajaMovimientoId: string | null;
    fecha: string | null;
    usuario: string | null;
  }
): Promise<{ id: string; numero: number; cliente: string; cliente_ruc: string | null } | null> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  if (!(await hayTabla(pool, schema))) return null;
  const cli = await datosCliente(pool, schema, d.clienteId);
  const concepto =
    d.saldoRestante > 0.5
      ? `Pago de la venta a crédito N° ${d.ventaNumero}`
      : `Pago total de la venta a crédito N° ${d.ventaNumero}`;
  const tR = quoteSchemaTable(schema, "recibos_dinero");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Un número por vez por empresa: dos cobros al mismo tiempo no pueden
    // llevarse el mismo correlativo.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`recibos:${schema}:${empresaId}`]);
    const ins = await client.query<{ id: string; numero: number }>(
      `INSERT INTO ${tR} (empresa_id, numero, fecha, cliente_id, cliente_nombre, cliente_ruc, monto, medio_pago,
                          concepto, venta_id, venta_numero, saldo_restante, caja_movimiento_id, usuario_nombre)
       SELECT $1::uuid, COALESCE(max(numero), 0) + 1, COALESCE($2::timestamptz, now()), $3::uuid, $4, $5, $6::numeric, $7,
              $8, $9::uuid, $10, $11::numeric, $12::uuid, $13
         FROM ${tR} WHERE empresa_id = $1::uuid
       RETURNING id, numero`,
      [empresaId, d.fecha, d.clienteId, cli.nombre, cli.ruc, d.monto, d.medioPago, concepto, d.ventaId,
       d.ventaNumero, Math.max(0, d.saldoRestante), d.cajaMovimientoId, d.usuario]
    );
    await client.query("COMMIT");
    const r = ins.rows[0];
    return { id: r.id, numero: Number(r.numero), cliente: cli.nombre, cliente_ruc: cli.ruc };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}

export async function listarRecibos(
  pool: Pool,
  schemaRaw: string,
  empresaId: string,
  f: { desde: string; hasta: string; q?: string | null }
): Promise<{ disponible: boolean; recibos: Recibo[] }> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  if (!(await hayTabla(pool, schema))) return { disponible: false, recibos: [] };
  const params: unknown[] = [empresaId, f.desde, f.hasta];
  let filtro = "";
  const q = (f.q ?? "").trim();
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    const n = Number(q.replace(/\D/g, ""));
    filtro = ` AND (lower(r.cliente_nombre) LIKE $4 OR lower(COALESCE(r.venta_numero, '')) LIKE $4
                    OR COALESCE(r.cliente_ruc, '') LIKE $4${Number.isFinite(n) && n > 0 ? ` OR r.numero = ${Math.trunc(n)}` : ""})`;
  }
  const { rows } = await pool.query(
    `SELECT r.id, r.numero, r.fecha::text AS fecha, r.cliente_nombre, r.cliente_ruc, r.monto::float AS monto,
            r.medio_pago, r.concepto, r.venta_numero, r.saldo_restante::float AS saldo_restante, r.usuario_nombre,
            (m.anulado_at IS NOT NULL) AS anulado
       FROM ${quoteSchemaTable(schema, "recibos_dinero")} r
       LEFT JOIN ${quoteSchemaTable(schema, "caja_movimientos")} m ON m.id = r.caja_movimiento_id
      WHERE r.empresa_id = $1::uuid
        AND (r.fecha AT TIME ZONE 'America/Asuncion')::date BETWEEN $2::date AND $3::date
        ${filtro}
      ORDER BY r.numero DESC
      LIMIT 2000`,
    params
  );
  return { disponible: true, recibos: rows as Recibo[] };
}
