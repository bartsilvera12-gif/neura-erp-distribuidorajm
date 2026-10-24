import "server-only";
import type { Pool, PoolClient } from "pg";
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
  /** 'cobro' (de una venta a crédito) o 'deposito' (anticipo, SQL 56). */
  tipo: "cobro" | "deposito";
  /** Depósito: cuánto ya se usó en ventas. */
  aplicado: number;
  cliente_id: string | null;
  referencia: string | null;
};

export class ReciboError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type Q = Pick<Pool, "query"> | PoolClient;

/** ¿Están las columnas de depósitos (SQL 56)? */
async function hayDepositos(q: Q, schema: string): Promise<boolean> {
  const r = await q.query<{ t: string | null }>(`SELECT to_regclass($1)::text AS t`, [
    `${schema}.deposito_aplicaciones`,
  ]);
  return !!r.rows[0]?.t;
}

export function numeroRecibo(n: number): string {
  return `REC-${String(n).padStart(6, "0")}`;
}

async function hayTabla(pool: Pool, schema: string): Promise<boolean> {
  const q = await pool.query<{ t: string | null }>(`SELECT to_regclass($1)::text AS t`, [`${schema}.recibos_cobro`]);
  return !!q.rows[0]?.t;
}

/** Nombre y RUC/CI del cliente, con las columnas que tenga la tabla. */
async function datosCliente(pool: Pool, schema: string, clienteId: string | null) {
  if (!clienteId) return { nombre: "Sin nombre", ruc: null as string | null, existe: false };
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
    existe: q.rows.length > 0,
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
  const tR = quoteSchemaTable(schema, "recibos_cobro");
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
  f: { desde: string; hasta: string; q?: string | null; conSaldo?: boolean }
): Promise<{ disponible: boolean; depositos: boolean; recibos: Recibo[] }> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  if (!(await hayTabla(pool, schema))) return { disponible: false, depositos: false, recibos: [] };
  const params: unknown[] = [empresaId, f.desde, f.hasta];
  let filtro = "";
  const q = (f.q ?? "").trim();
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    const n = Number(q.replace(/\D/g, ""));
    filtro = ` AND (lower(r.cliente_nombre) LIKE $4 OR lower(COALESCE(r.venta_numero, '')) LIKE $4
                    OR COALESCE(r.cliente_ruc, '') LIKE $4${Number.isFinite(n) && n > 0 ? ` OR r.numero = ${Math.trunc(n)}` : ""})`;
  }
  const dep = await hayDepositos(pool, schema);
  // Depósitos con saldo: de cualquier fecha (un anticipo viejo sigue vigente).
  const periodo =
    f.conSaldo && dep
      ? `AND r.tipo = 'deposito' AND NOT r.anulado AND r.monto > r.aplicado AND $2::date IS NOT NULL AND $3::date IS NOT NULL`
      : `AND (r.fecha AT TIME ZONE 'America/Asuncion')::date BETWEEN $2::date AND $3::date`;
  const { rows } = await pool.query(
    `SELECT r.id, r.numero, r.fecha::text AS fecha, r.cliente_nombre, r.cliente_ruc, r.monto::float AS monto,
            r.medio_pago, r.concepto, r.venta_numero, r.saldo_restante::float AS saldo_restante, r.usuario_nombre,
            r.cliente_id,
            (m.anulado_at IS NOT NULL ${dep ? "OR r.anulado" : ""}) AS anulado,
            ${dep ? "r.tipo, r.aplicado::float AS aplicado, r.referencia" : "'cobro' AS tipo, 0::float AS aplicado, NULL::text AS referencia"}
       FROM ${quoteSchemaTable(schema, "recibos_cobro")} r
       LEFT JOIN ${quoteSchemaTable(schema, "caja_movimientos")} m ON m.id = r.caja_movimiento_id
      WHERE r.empresa_id = $1::uuid
        ${periodo}
        ${filtro}
      ORDER BY r.numero DESC
      LIMIT 2000`,
    params
  );
  return { disponible: true, depositos: dep, recibos: rows as Recibo[] };
}

// ── Depósitos de clientes (SQL 56) ───────────────────────────────────────────

export type Deposito = {
  id: string;
  numero: number;
  fecha: string;
  cliente_id: string | null;
  cliente_nombre: string;
  cliente_ruc: string | null;
  monto: number;
  aplicado: number;
  saldo: number;
  medio_pago: string | null;
  anulado: boolean;
};

const FALTA_SQL_56 = "Falta correr el SQL 56 (depósitos de clientes).";

/**
 * El cliente deja plata a cuenta: queda un recibo numerado de tipo depósito,
 * sin movimiento de caja, con todo el monto como saldo a favor.
 */
export async function registrarDeposito(
  pool: Pool,
  schemaRaw: string,
  empresaId: string,
  d: { clienteId: string; monto: number; medioPago: string; referencia: string | null; observaciones: string | null; usuario: string | null }
): Promise<{ id: string; numero: number; cliente: string; cliente_ruc: string | null }> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  if (!(await hayTabla(pool, schema)) || !(await hayDepositos(pool, schema))) throw new ReciboError(FALTA_SQL_56, 409);
  if (!(d.monto > 0)) throw new ReciboError("Poné el monto del depósito.");
  const cli = await datosCliente(pool, schema, d.clienteId);
  if (!cli.existe) throw new ReciboError("Elegí el cliente.");
  const tR = quoteSchemaTable(schema, "recibos_cobro");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`recibos:${schema}:${empresaId}`]);
    const ins = await client.query<{ id: string; numero: number }>(
      `INSERT INTO ${tR} (empresa_id, numero, cliente_id, cliente_nombre, cliente_ruc, monto, medio_pago, concepto,
                          usuario_nombre, tipo, aplicado, referencia, observaciones)
       SELECT $1::uuid, COALESCE(max(numero), 0) + 1, $2::uuid, $3, $4, $5::numeric, $6, 'Depósito a cuenta',
              $7, 'deposito', 0, $8, $9
         FROM ${tR} WHERE empresa_id = $1::uuid
       RETURNING id, numero`,
      [empresaId, d.clienteId, cli.nombre, cli.ruc, Math.round(d.monto), d.medioPago, d.usuario, d.referencia, d.observaciones]
    );
    await client.query("COMMIT");
    return { id: ins.rows[0].id, numero: Number(ins.rows[0].numero), cliente: cli.nombre, cliente_ruc: cli.ruc };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}

export async function getDeposito(pool: Pool, schemaRaw: string, empresaId: string, id: string): Promise<Deposito | null> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  if (!(await hayTabla(pool, schema)) || !(await hayDepositos(pool, schema))) throw new ReciboError(FALTA_SQL_56, 409);
  const { rows } = await pool.query(
    `SELECT id, numero, fecha::text AS fecha, cliente_id, cliente_nombre, cliente_ruc, monto::float AS monto,
            aplicado::float AS aplicado, (monto - aplicado)::float AS saldo, medio_pago, anulado
       FROM ${quoteSchemaTable(schema, "recibos_cobro")}
      WHERE id = $1::uuid AND empresa_id = $2::uuid AND tipo = 'deposito'`,
    [id, empresaId]
  );
  return (rows[0] as Deposito) ?? null;
}

/** Un depósito sin usar se puede anular (quedó mal cargado). */
export async function anularDeposito(pool: Pool, schemaRaw: string, empresaId: string, id: string): Promise<void> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  if (!(await hayDepositos(pool, schema))) throw new ReciboError(FALTA_SQL_56, 409);
  const r = await pool.query(
    `UPDATE ${quoteSchemaTable(schema, "recibos_cobro")} SET anulado = true
      WHERE id = $1::uuid AND empresa_id = $2::uuid AND tipo = 'deposito' AND NOT anulado AND aplicado = 0`,
    [id, empresaId]
  );
  if (r.rowCount === 0) throw new ReciboError("Solo se puede anular un depósito que todavía no se usó en una venta.", 409);
}

/**
 * Dentro de la transacción de la venta: usa el saldo del depósito para pagarla
 * (hasta el total). Devuelve cuánto se aplicó; lo que falte se cobra aparte.
 */
export async function aplicarDepositoEnTx(
  client: PoolClient,
  schemaRaw: string,
  empresaId: string,
  d: { depositoId: string; clienteId: string | null; ventaId: string; total: number }
): Promise<number> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  if (!(await hayDepositos(client, schema))) throw new Error(FALTA_SQL_56);
  const tR = quoteSchemaTable(schema, "recibos_cobro");
  const q = await client.query<{ cliente_id: string | null; saldo: string; anulado: boolean; numero: number }>(
    `SELECT cliente_id, (monto - aplicado)::text AS saldo, anulado, numero
       FROM ${tR} WHERE id = $1::uuid AND empresa_id = $2::uuid AND tipo = 'deposito' FOR UPDATE`,
    [d.depositoId, empresaId]
  );
  const dep = q.rows[0];
  if (!dep) throw new Error("El depósito no existe.");
  if (dep.anulado) throw new Error("Ese depósito está anulado.");
  if (dep.cliente_id && d.clienteId !== dep.cliente_id) {
    throw new Error("El depósito es de otro cliente: la venta tiene que ser a nombre del mismo cliente.");
  }
  const aplicar = Math.min(Number(dep.saldo), d.total);
  if (!(aplicar > 0)) throw new Error(`El depósito ${numeroRecibo(dep.numero)} ya no tiene saldo.`);
  await client.query(`UPDATE ${tR} SET aplicado = aplicado + $3::numeric WHERE id = $1::uuid AND empresa_id = $2::uuid`, [
    d.depositoId,
    empresaId,
    aplicar,
  ]);
  await client.query(
    `INSERT INTO ${quoteSchemaTable(schema, "deposito_aplicaciones")} (empresa_id, recibo_id, venta_id, monto)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::numeric)`,
    [empresaId, d.depositoId, d.ventaId, aplicar]
  );
  return aplicar;
}

/** Al anular una venta pagada con depósito, el saldo vuelve al depósito. */
export async function revertirDepositoVentaEnTx(client: PoolClient, schemaRaw: string, empresaId: string, ventaId: string) {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  if (!(await hayDepositos(client, schema))) return;
  const tA = quoteSchemaTable(schema, "deposito_aplicaciones");
  const apl = await client.query<{ id: string; recibo_id: string; monto: string }>(
    `SELECT id, recibo_id, monto::text FROM ${tA}
      WHERE empresa_id = $1::uuid AND venta_id = $2::uuid AND NOT anulado FOR UPDATE`,
    [empresaId, ventaId]
  );
  for (const a of apl.rows) {
    await client.query(
      `UPDATE ${quoteSchemaTable(schema, "recibos_cobro")} SET aplicado = GREATEST(aplicado - $3::numeric, 0)
        WHERE id = $1::uuid AND empresa_id = $2::uuid`,
      [a.recibo_id, empresaId, a.monto]
    );
    await client.query(`UPDATE ${tA} SET anulado = true WHERE id = $1::uuid`, [a.id]);
  }
}
