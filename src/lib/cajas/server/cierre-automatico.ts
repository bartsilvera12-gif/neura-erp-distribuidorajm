import "server-only";
import type { Pool, PoolClient } from "pg";
import { quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { totalConteo, type ConteoEfectivo } from "@/lib/cajas/conteo";

/**
 * Cierre automático de caja a las 23:00 (hora de Asunción).
 *
 * Una caja que sigue abierta pasadas las 23:00 del día en que se abrió se
 * cierra sola, con fecha de cierre a las 23:00 de ese día. Así las ventas y
 * cobranzas de días distintos no se acumulan en la misma caja: la primera
 * venta del día siguiente abre una caja nueva.
 *
 * No hace falta una tarea programada: se revisa cada vez que alguien consulta
 * la caja o cobra (ver /api/cajas, /api/cajas/arqueo y asegurarCajaAbierta).
 * La primera consulta después de las 23:00 la cierra, con la hora de las 23:00.
 *
 * Lo contado: si la planilla de arqueo tiene el conteo de billetes, se usa ese;
 * si no, queda sin contar (la diferencia se ve en el arqueo como pendiente).
 * Los movimientos no se tocan: solo cambia el estado de la caja.
 */

const TZ = "America/Asuncion";
/** No se revisa en cada pedido: una vez por minuto por empresa alcanza. */
const CADA_MS = 60_000;
const ultimaRevision = new Map<string, number>();
const columnasCache = new Map<string, { cols: Set<string>; hasta: number }>();

async function columnas(q: Pool | PoolClient, schema: string, tabla: string): Promise<Set<string>> {
  const k = `${schema}.${tabla}`;
  const c = columnasCache.get(k);
  if (c && c.hasta > Date.now()) return c.cols;
  const r = await q.query<{ c: string }>(
    `SELECT column_name AS c FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
    [schema, tabla]
  );
  const cols = new Set(r.rows.map((x) => x.c));
  columnasCache.set(k, { cols, hasta: Date.now() + 10 * 60_000 });
  return cols;
}

/** Hora de corte de una caja: las 23:00 del día (en Asunción) en que se abrió. */
const CORTE = `(((c.fecha_apertura AT TIME ZONE '${TZ}')::date + time '23:00') AT TIME ZONE '${TZ}')`;

/**
 * Cierra las cajas abiertas de la empresa que pasaron su corte de las 23:00.
 * Devuelve cuántas cerró. Nunca tira: un fallo acá no puede trabar la caja.
 */
export async function cerrarCajasVencidas(pool: Pool, schemaRaw: string, empresaId: string): Promise<number> {
  const clave = `${schemaRaw}:${empresaId}`;
  const ahora = Date.now();
  if (ahora - (ultimaRevision.get(clave) ?? 0) < CADA_MS) return 0;
  ultimaRevision.set(clave, ahora);

  try {
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const ex = await pool.query<{ c: string | null; m: string | null }>(
      `SELECT to_regclass($1)::text AS c, to_regclass($2)::text AS m`,
      [`${schema}.cajas`, `${schema}.caja_movimientos`]
    );
    if (!ex.rows[0]?.c || !ex.rows[0]?.m) return 0;

    const tC = quoteSchemaTable(schema, "cajas");
    const vencidas = await pool.query<{ id: string }>(
      `SELECT c.id FROM ${tC} c
        WHERE c.empresa_id = $1::uuid AND c.estado = 'abierta' AND now() >= ${CORTE}`,
      [empresaId]
    );
    let cerradas = 0;
    for (const v of vencidas.rows) {
      if (await cerrarUna(pool, schema, empresaId, v.id)) cerradas += 1;
    }
    if (cerradas > 0) console.info(`[cierre-automatico] ${cerradas} caja(s) cerrada(s) a las 23:00`, { empresaId });
    return cerradas;
  } catch (e) {
    console.error("[cierre-automatico]", e instanceof Error ? e.message : e);
    return 0;
  }
}

/**
 * Cierra una caja abierta. Con `ahora`, a la hora actual (al enviar la
 * planilla de arqueo); si no, a las 23:00 del día en que se abrió.
 */
export async function cerrarUna(
  pool: Pool,
  schema: string,
  empresaId: string,
  cajaId: string,
  opts: { ahora?: boolean; cerradaPor?: string | null } = {}
): Promise<boolean> {
  const tC = quoteSchemaTable(schema, "cajas");
  const tM = quoteSchemaTable(schema, "caja_movimientos");
  // Lo que no depende de la transacción se lee antes de tomar la conexión.
  const cols = await columnas(pool, schema, "cajas");
  const conteo = await conteoDePlanilla(pool, schema, empresaId, cajaId);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const q = await client.query<{ estado: string; monto_apertura: string; sencillo: string; corte: string; conteo: ConteoEfectivo | null }>(
      `SELECT c.estado, COALESCE(c.monto_apertura, 0)::text AS monto_apertura,
              ${cols.has("sencillo") ? "COALESCE(c.sencillo, 0)::text" : "'0'"} AS sencillo,
              ${opts.ahora ? "now()::text" : `${CORTE}::text`} AS corte,
              ${cols.has("conteo_efectivo") ? "c.conteo_efectivo" : "NULL::jsonb"} AS conteo
         FROM ${tC} c WHERE c.id = $1::uuid AND c.empresa_id = $2::uuid FOR UPDATE`,
      [cajaId, empresaId]
    );
    const c = q.rows[0];
    // Otro pedido la cerró mientras tanto (o la cerró el cajero): nada que hacer.
    if (!c || c.estado !== "abierta") {
      await client.query("ROLLBACK");
      return false;
    }

    // Efectivo esperado: igual que el cierre manual (/api/cajas/[id]/cerrar).
    const movs = await client.query<{ tipo: string; total: string }>(
      `SELECT tipo, COALESCE(sum(monto), 0)::text AS total FROM ${tM}
        WHERE empresa_id = $1::uuid AND caja_id = $2::uuid AND anulado_at IS NULL
          AND lower(btrim(COALESCE(medio_pago, ''))) = 'efectivo'
        GROUP BY tipo`,
      [empresaId, cajaId]
    );
    const t = new Map(movs.rows.map((r) => [r.tipo, Number(r.total)]));
    const esperado =
      Number(c.monto_apertura) + Number(c.sencillo) +
      (t.get("ingreso") ?? 0) - (t.get("egreso") ?? 0) - (t.get("retiro") ?? 0) + (t.get("ajuste") ?? 0);

    const conteoFinal = conteo ?? c.conteo ?? null;
    const contado = conteoFinal ? totalConteo(conteoFinal) : null;

    const params: unknown[] = [cajaId, c.corte];
    let extra = "";
    if (cols.has("monto_esperado_efectivo")) {
      params.push(esperado);
      extra += `, monto_esperado_efectivo = $${params.length}`;
    }
    if (cols.has("monto_cierre_contado")) {
      params.push(contado);
      extra += `, monto_cierre_contado = $${params.length}`;
    }
    if (cols.has("diferencia")) {
      params.push(contado === null ? null : contado - esperado);
      extra += `, diferencia = $${params.length}`;
    }
    if (opts.cerradaPor && cols.has("cerrada_por")) {
      params.push(opts.cerradaPor);
      extra += `, cerrada_por = $${params.length}::uuid`;
    }
    if (conteoFinal && cols.has("conteo_efectivo")) {
      params.push(JSON.stringify(conteoFinal));
      extra += `, conteo_efectivo = $${params.length}::jsonb`;
    }
    await client.query(
      `UPDATE ${tC} SET estado = 'cerrada', fecha_cierre = $2::timestamptz ${extra} WHERE id = $1::uuid`,
      params
    );
    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[cierre-automatico] caja", cajaId, e instanceof Error ? e.message : e);
    return false;
  } finally {
    client.release();
  }
}

/** El conteo de billetes cargado en la planilla de arqueo de esa caja, si hay. */
async function conteoDePlanilla(pool: Pool, schema: string, empresaId: string, cajaId: string): Promise<ConteoEfectivo | null> {
  const ex = await pool.query<{ t: string | null }>(`SELECT to_regclass($1)::text AS t`, [`${schema}.planillas_arqueo`]);
  if (!ex.rows[0]?.t) return null;
  const r = await pool.query<{ conteo: ConteoEfectivo | null }>(
    `SELECT datos->'conteo' AS conteo FROM ${quoteSchemaTable(schema, "planillas_arqueo")}
      WHERE empresa_id = $1::uuid AND caja_id = $2::uuid`,
    [empresaId, cajaId]
  );
  const cnt = r.rows[0]?.conteo;
  if (!cnt || typeof cnt !== "object") return null;
  // Una planilla sin billetes cargados no es un conteo.
  return totalConteo(cnt) > 0 ? cnt : null;
}
