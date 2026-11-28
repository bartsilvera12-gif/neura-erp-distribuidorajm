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
  boca: string;
};

export type BocaTransferencia = { id: string; label: string; operaciones: number; total: number };

export type ReporteTransferencias = {
  desde: string;
  hasta: string;
  generado_at: string;
  disponible: boolean;
  resumen: { operaciones: number; total: number };
  filas: FilaTransferencia[];
  bocas: BocaTransferencia[];
  boca: string;
};

export interface FiltrosTransferencias {
  desde: string;
  hasta: string;
  /** "todas" (default), "salon", "admin" o "camion:<id>". */
  boca?: string;
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
    return { ...base, disponible: false, resumen: { operaciones: 0, total: 0 }, filas: [], bocas: [], boca: "todas" };
  }

  const tM = quoteSchemaTable(schema, "caja_movimientos");
  const tC = quoteSchemaTable(schema, "cajas");
  const tU = quoteSchemaTable(schema, "usuarios");
  const tCam = quoteSchemaTable(schema, "camiones");

  // Bocas: Caja Salón, Administración y cada camión (la boca de un cobro es quien abrió la caja).
  const camRes = await queryWithRetry<{ id: string; alias: string; nombre: string | null }>(
    pool(),
    `SELECT c.id, c.alias, u.nombre FROM ${tCam} c LEFT JOIN ${tU} u ON u.id = c.repartidor_id
      WHERE c.empresa_id = $1::uuid AND c.activo ORDER BY c.alias`,
    [empresaId]
  );
  const labels = new Map<string, string>();
  labels.set("salon", "Caja Salón");
  for (const c of camRes.rows) {
    const alias = c.alias.replace(/[\s-]+$/, "").trim();
    const nom = (c.nombre ?? "").trim();
    labels.set(
      `camion:${c.id}`,
      nom && !alias.toLowerCase().includes(nom.toLowerCase()) ? `${alias} – ${nom}` : alias
    );
  }
  labels.set("admin", "Administración");

  const { rows } = await queryWithRetry<{
    id: string;
    fecha: string | null;
    concepto: string | null;
    es_venta: boolean;
    monto: string;
    boca: string;
  }>(
    pool(),
    `SELECT m.id,
            to_char((COALESCE(m.created_at, m.fecha::timestamptz) AT TIME ZONE $4)::date, 'YYYY-MM-DD') AS fecha,
            m.concepto,
            (m.venta_id IS NOT NULL) AS es_venta,
            m.monto AS monto,
            COALESCE('camion:' || cam.id::text, CASE WHEN u.rol = 'admin' THEN 'admin' ELSE 'salon' END) AS boca
       FROM ${tM} m
       LEFT JOIN ${tC} cj ON cj.id = m.caja_id
       LEFT JOIN ${tU} u ON u.id = cj.abierta_por
       LEFT JOIN ${tCam} cam ON cam.repartidor_id = cj.abierta_por AND cam.empresa_id = m.empresa_id
      WHERE m.empresa_id = $1::uuid
        AND m.anulado_at IS NULL
        AND m.tipo = 'ingreso'
        AND lower(btrim(COALESCE(m.medio_pago, ''))) = 'transferencia'
        AND (COALESCE(m.created_at, m.fecha::timestamptz) AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
      ORDER BY COALESCE(m.created_at, m.fecha::timestamptz) DESC`,
    [empresaId, f.desde, f.hasta, TZ]
  );

  const todas: FilaTransferencia[] = rows.map((r) => ({
    id: r.id,
    fecha: r.fecha,
    concepto: r.concepto,
    es_venta: r.es_venta,
    monto: num(r.monto),
    boca: r.boca,
  }));
  const bocas: BocaTransferencia[] = [...labels.entries()].map(([id, label]) => {
    const fs = todas.filter((x) => x.boca === id);
    return { id, label, operaciones: fs.length, total: fs.reduce((a, x) => a + x.monto, 0) };
  });
  const boca = f.boca && labels.has(f.boca) ? f.boca : "todas";
  const filas = boca === "todas" ? todas : todas.filter((x) => x.boca === boca);
  const total = filas.reduce((a, r) => a + r.monto, 0);

  return {
    ...base,
    disponible: true,
    resumen: { operaciones: filas.length, total },
    filas,
    bocas,
    boca,
  };
}
