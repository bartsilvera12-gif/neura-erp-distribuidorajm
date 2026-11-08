import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { hoyEnAsuncion, mesEnCursoAsuncion } from "@/lib/reportes/ventas-reporte";

/**
 * Reporte de cobranzas recibidas por TRANSFERENCIA, para conciliación bancaria.
 *
 * Fuente: `caja_movimientos` de tipo `ingreso` con `medio_pago = 'transferencia'`
 * (no anulados). Es el libro de la plata que entró por transferencia: cubre
 * tanto las ventas cobradas por transferencia como la porción transferencia de
 * los pagos mixtos (el concepto lo marca, p. ej. "Venta VTA-123 (mixto)").
 *
 * Nota: este ERP captura banco/titular/nº de operación solo cuando se usa el
 * módulo de Conciliación (tabla `cobros_pendientes`). Si no se usa, acá se
 * muestra fecha, concepto e importe —suficiente para conciliar montos y fechas
 * contra el extracto del banco—. El día es el de Asunción.
 */

const TZ = "America/Asuncion";
const num = (v: unknown): number => (v == null ? 0 : Number(v));

export { hoyEnAsuncion, mesEnCursoAsuncion };

export type FilaTransferencia = {
  id: string;
  fecha: string | null;
  concepto: string | null;
  es_venta: boolean;
  monto: number;
};

export type ReporteTransferencias = {
  desde: string;
  hasta: string;
  generado_at: string;
  disponible: boolean;
  resumen: { operaciones: number; total: number };
  filas: FilaTransferencia[];
};

export interface FiltrosTransferencias {
  desde: string;
  hasta: string;
}

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

export async function getReporteTransferencias(
  schemaRaw: string,
  empresaId: string,
  f: FiltrosTransferencias
): Promise<ReporteTransferencias> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const generado_at = new Date().toISOString();
  const base = { desde: f.desde, hasta: f.hasta, generado_at };

  const existe = await queryWithRetry<{ t: string | null }>(
    pool(),
    `SELECT to_regclass($1)::text AS t`,
    [`${schema}.caja_movimientos`]
  );
  if (!existe.rows[0]?.t) {
    return { ...base, disponible: false, resumen: { operaciones: 0, total: 0 }, filas: [] };
  }

  const tM = quoteSchemaTable(schema, "caja_movimientos");
  const { rows } = await queryWithRetry<{
    id: string;
    fecha: string | null;
    concepto: string | null;
    es_venta: boolean;
    monto: string;
  }>(
    pool(),
    `SELECT m.id,
            to_char((COALESCE(m.created_at, m.fecha::timestamptz) AT TIME ZONE $4)::date, 'YYYY-MM-DD') AS fecha,
            m.concepto,
            (m.venta_id IS NOT NULL) AS es_venta,
            m.monto AS monto
       FROM ${tM} m
      WHERE m.empresa_id = $1::uuid
        AND m.anulado_at IS NULL
        AND m.tipo = 'ingreso'
        AND lower(btrim(COALESCE(m.medio_pago, ''))) = 'transferencia'
        AND (COALESCE(m.created_at, m.fecha::timestamptz) AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
      ORDER BY COALESCE(m.created_at, m.fecha::timestamptz) DESC`,
    [empresaId, f.desde, f.hasta, TZ]
  );

  const filas: FilaTransferencia[] = rows.map((r) => ({
    id: r.id,
    fecha: r.fecha,
    concepto: r.concepto,
    es_venta: r.es_venta,
    monto: num(r.monto),
  }));
  const total = filas.reduce((a, r) => a + r.monto, 0);

  return {
    ...base,
    disponible: true,
    resumen: { operaciones: filas.length, total },
    filas,
  };
}
