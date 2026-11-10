import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { armarArqueoMensual, type DiaArqueo, type ArqueoMensual } from "@/lib/reportes/arqueo-mensual";

/**
 * Arqueo del mes como la planilla «ARQUEO DIARIO» de la distribuidora: una
 * tabla por persona (cada camionero y el salón), una fila por día, con
 * contado, cobranzas, crédito, cheques, transferencias, gastos, efectivo
 * rendido y diferencia; subtotales por semana y total del mes.
 *
 * Una fila es una caja (desde el cierre automático, una caja por persona y
 * día). Los números salen de los movimientos de caja y de las ventas, igual
 * que la planilla de arqueo de cada caja.
 */
const TZ = "America/Asuncion";

export async function getArqueoMensual(schemaRaw: string, empresaId: string, mes: string): Promise<ArqueoMensual> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Pool no disponible.");
  const [anio, m] = mes.split("-").map(Number);
  const desde = `${mes}-01`;
  const hasta = new Date(Date.UTC(anio, m, 0)).toISOString().slice(0, 10);

  const ex = await queryWithRetry<{ c: string | null; m: string | null; u: string | null }>(
    pool,
    `SELECT to_regclass($1)::text AS c, to_regclass($2)::text AS m, to_regclass($3)::text AS u`,
    [`${schema}.cajas`, `${schema}.caja_movimientos`, `${schema}.usuarios`]
  );
  if (!ex.rows[0]?.c || !ex.rows[0]?.m) return armarArqueoMensual(mes, []);

  const cols = new Set(
    (
      await queryWithRetry<{ c: string }>(
        pool,
        `SELECT column_name AS c FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'cajas'`,
        [schema]
      )
    ).rows.map((r) => r.c)
  );
  const dueno = cols.has("abierta_por") ? "k.abierta_por" : cols.has("usuario_id") ? "k.usuario_id" : "NULL::uuid";
  const tC = quoteSchemaTable(schema, "cajas");
  const tM = quoteSchemaTable(schema, "caja_movimientos");
  const tV = quoteSchemaTable(schema, "ventas");
  const nombre = ex.rows[0]?.u
    ? `(SELECT COALESCE(NULLIF(btrim(u.nombre), ''), u.email) FROM ${quoteSchemaTable(schema, "usuarios")} u WHERE u.id = ${dueno})`
    : "NULL::text";

  const { rows } = await queryWithRetry<{
    caja_id: string;
    numero_caja: number;
    usuario_id: string | null;
    usuario: string | null;
    fecha: string;
    apertura: string;
    contado: string;
    cobranzas: string;
    otros: string;
    cheque: string;
    transferencia: string;
    gastos: string;
    credito: string;
    efectivo: string | null;
    cerrada: boolean;
  }>(
    pool,
    `SELECT k.id AS caja_id, k.numero_caja,
            ${dueno}::text AS usuario_id,
            ${nombre} AS usuario,
            to_char((k.fecha_apertura AT TIME ZONE $4)::date, 'YYYY-MM-DD') AS fecha,
            (COALESCE(k.monto_apertura, 0) + ${cols.has("sencillo") ? "COALESCE(k.sencillo, 0)" : "0"})::text AS apertura,
            COALESCE(sum(mv.monto) FILTER (WHERE mv.tipo = 'ingreso' AND v.tipo_venta = 'CONTADO'), 0)::text AS contado,
            COALESCE(sum(mv.monto) FILTER (WHERE mv.tipo = 'ingreso' AND v.tipo_venta = 'CREDITO'), 0)::text AS cobranzas,
            COALESCE(sum(mv.monto) FILTER (WHERE mv.tipo = 'ingreso' AND mv.venta_id IS NULL), 0)::text AS otros,
            COALESCE(sum(mv.monto) FILTER (WHERE mv.tipo = 'ingreso' AND lower(mv.medio_pago) = 'cheque'), 0)::text AS cheque,
            COALESCE(sum(mv.monto) FILTER (WHERE mv.tipo = 'ingreso' AND lower(mv.medio_pago) = 'transferencia'), 0)::text AS transferencia,
            (COALESCE(sum(mv.monto) FILTER (WHERE mv.tipo IN ('egreso', 'retiro')), 0)
              - COALESCE(sum(mv.monto) FILTER (WHERE mv.tipo = 'ajuste'), 0))::text AS gastos,
            COALESCE((SELECT sum(vc.total) FROM ${tV} vc
                       WHERE vc.caja_id = k.id AND vc.tipo_venta = 'CREDITO'
                         AND COALESCE(vc.estado, '') <> 'anulada'), 0)::text AS credito,
            ${cols.has("monto_cierre_contado") ? "k.monto_cierre_contado::text" : "NULL::text"} AS efectivo,
            (k.estado = 'cerrada') AS cerrada
       FROM ${tC} k
       LEFT JOIN ${tM} mv ON mv.caja_id = k.id AND mv.anulado_at IS NULL
       LEFT JOIN ${tV} v ON v.id = mv.venta_id
      WHERE k.empresa_id = $1::uuid
        AND (k.fecha_apertura AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
      GROUP BY k.id
      ORDER BY (k.fecha_apertura AT TIME ZONE $4)::date, k.numero_caja`,
    [empresaId, desde, hasta, TZ]
  );

  const n = (v: string | null) => Number(v) || 0;
  const dias: DiaArqueo[] = rows.map((r) => ({
    caja_id: r.caja_id,
    numero_caja: Number(r.numero_caja),
    usuario_id: r.usuario_id,
    usuario: r.usuario,
    fecha: r.fecha,
    apertura: n(r.apertura),
    contado: n(r.contado),
    cobranzas: n(r.cobranzas),
    otros: n(r.otros),
    cheque: n(r.cheque),
    transferencia: n(r.transferencia),
    gastos: n(r.gastos),
    credito: n(r.credito),
    efectivo: r.efectivo === null ? null : n(r.efectivo),
    cerrada: r.cerrada,
  }));
  return armarArqueoMensual(mes, dias);
}
