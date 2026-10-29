import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import type { CierreCaja } from "@/lib/reportes/cierres-caja";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Período y estado del reporte, de la URL (por defecto: este mes). */
export function filtrosCierres(request: Request) {
  const sp = new URL(request.url).searchParams;
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
  const est = sp.get("estado");
  return {
    desde: FECHA.test(sp.get("desde") ?? "") ? sp.get("desde")! : `${hoy.slice(0, 8)}01`,
    hasta: FECHA.test(sp.get("hasta") ?? "") ? sp.get("hasta")! : hoy,
    estado: est === "abierta" || est === "cerrada" ? est : null,
  } as const;
}


/**
 * Reporte de cierres de caja: todas las cajas de un período, cada una con su
 * arqueo (misma cuenta que la pantalla de Arqueo): cobrado por medio, crédito,
 * cobranzas, egresos, efectivo esperado, contado al cerrar y diferencia, más
 * cómo quedó su planilla de arqueo.
 */
export async function listarCierresCaja(
  schemaRaw: string,
  empresaId: string,
  f: { desde: string; hasta: string; estado?: "abierta" | "cerrada" | null }
): Promise<CierreCaja[]> {
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Sin conexión a la base.");
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tC = quoteSchemaTable(schema, "cajas");
  const tM = quoteSchemaTable(schema, "caja_movimientos");
  const tV = quoteSchemaTable(schema, "ventas");

  const colsQ = await pool.query<{ c: string }>(
    `SELECT column_name AS c FROM information_schema.columns WHERE table_schema = $1 AND table_name IN ('cajas', 'ventas')`,
    [schema]
  );
  const cols = new Set(colsQ.rows.map((r) => r.c));
  const dueno = cols.has("abierta_por") ? "c.abierta_por" : cols.has("usuario_id") ? "c.usuario_id" : "NULL::uuid";
  const conPlanillas = !!(
    await pool.query<{ t: string | null }>(`SELECT to_regclass($1)::text AS t`, [`${schema}.planillas_arqueo`])
  ).rows[0]?.t;

  const { rows } = await pool.query<Record<string, string | null>>(
    `WITH m AS (
       SELECT m.caja_id, m.tipo, lower(btrim(COALESCE(m.medio_pago, ''))) AS medio, m.monto, v.tipo_venta, m.venta_id
         FROM ${tM} m LEFT JOIN ${tV} v ON v.id = m.venta_id
        WHERE m.empresa_id = $1::uuid AND m.anulado_at IS NULL
     ),
     agg AS (
       SELECT caja_id,
              SUM(monto) FILTER (WHERE tipo = 'ingreso' AND venta_id IS NOT NULL AND COALESCE(tipo_venta, '') <> 'CREDITO' AND medio = 'efectivo') AS efectivo,
              SUM(monto) FILTER (WHERE tipo = 'ingreso' AND venta_id IS NOT NULL AND COALESCE(tipo_venta, '') <> 'CREDITO' AND medio = 'transferencia') AS transferencia,
              SUM(monto) FILTER (WHERE tipo = 'ingreso' AND venta_id IS NOT NULL AND COALESCE(tipo_venta, '') <> 'CREDITO' AND medio = 'cheque') AS cheque,
              SUM(monto) FILTER (WHERE tipo = 'ingreso' AND venta_id IS NOT NULL AND COALESCE(tipo_venta, '') <> 'CREDITO' AND medio NOT IN ('efectivo', 'transferencia', 'cheque')) AS otros_medios,
              SUM(monto) FILTER (WHERE tipo = 'ingreso' AND venta_id IS NOT NULL AND tipo_venta = 'CREDITO') AS cobranzas,
              SUM(monto) FILTER (WHERE tipo = 'ingreso' AND venta_id IS NULL) AS otros_ingresos,
              SUM(monto) FILTER (WHERE tipo IN ('egreso', 'retiro')) AS egresos,
              SUM(CASE WHEN medio <> 'efectivo' THEN 0
                       WHEN tipo IN ('ingreso', 'ajuste') THEN monto
                       WHEN tipo IN ('egreso', 'retiro') THEN -monto ELSE 0 END) AS neto_efectivo
         FROM m GROUP BY caja_id
     )
     SELECT c.id::text AS caja_id, c.numero_caja::text AS numero_caja, c.estado,
            c.fecha_apertura::text AS fecha_apertura, c.fecha_cierre::text AS fecha_cierre,
            ${dueno}::text AS dueno,
            (COALESCE(c.monto_apertura, 0) + ${cols.has("sencillo") ? "COALESCE(c.sencillo, 0)" : "0"})::text AS apertura,
            COALESCE(a.efectivo, 0)::text AS efectivo, COALESCE(a.transferencia, 0)::text AS transferencia,
            COALESCE(a.cheque, 0)::text AS cheque, COALESCE(a.otros_medios, 0)::text AS otros_medios,
            COALESCE(a.cobranzas, 0)::text AS cobranzas, COALESCE(a.otros_ingresos, 0)::text AS otros_ingresos,
            COALESCE(a.egresos, 0)::text AS egresos, COALESCE(a.neto_efectivo, 0)::text AS neto_efectivo,
            ${cols.has("caja_id") ? `(SELECT COALESCE(SUM(v.total), 0) FROM ${tV} v
               WHERE v.empresa_id = c.empresa_id AND v.caja_id = c.id AND v.tipo_venta = 'CREDITO'
                 AND COALESCE(v.estado, '') <> 'anulada')::text` : "'0'"} AS credito,
            c.monto_cierre_contado::text AS contado_cierre, c.diferencia::text AS diferencia_guardada,
            ${conPlanillas ? "p.estado" : "NULL::text"} AS planilla_estado,
            ${conPlanillas ? "p.diferencia::text" : "NULL::text"} AS planilla_diferencia
       FROM ${tC} c
       LEFT JOIN agg a ON a.caja_id = c.id
       ${conPlanillas ? `LEFT JOIN ${quoteSchemaTable(schema, "planillas_arqueo")} p ON p.caja_id = c.id AND p.empresa_id = c.empresa_id` : ""}
      WHERE c.empresa_id = $1::uuid
        AND (c.fecha_apertura AT TIME ZONE 'America/Asuncion')::date BETWEEN $2::date AND $3::date
        ${f.estado ? "AND c.estado = $4" : ""}
      ORDER BY c.fecha_apertura DESC
      LIMIT 1000`,
    f.estado ? [empresaId, f.desde, f.hasta, f.estado] : [empresaId, f.desde, f.hasta]
  );

  // Nombres de quienes abrieron las cajas (catálogo de usuarios).
  const ids = [...new Set(rows.map((r) => r.dueno).filter((x): x is string => !!x))];
  const nombres = new Map<string, string>();
  if (ids.length > 0) {
    try {
      const { data } = await createServiceRoleClient().from("usuarios").select("id, nombre, email").in("id", ids);
      for (const u of (data ?? []) as { id: string; nombre?: string | null; email?: string | null }[]) {
        nombres.set(u.id, u.nombre?.trim() || u.email || "—");
      }
    } catch {
      /* sin nombres: el reporte sale igual */
    }
  }

  const n = (v: string | null) => Number(v ?? 0) || 0;
  return rows.map((r) => {
    const contado = n(r.efectivo) + n(r.transferencia) + n(r.cheque) + n(r.otros_medios);
    const esperado = n(r.apertura) + n(r.neto_efectivo);
    const contadoCierre = r.contado_cierre === null ? null : n(r.contado_cierre);
    return {
      caja_id: r.caja_id as string,
      numero_caja: n(r.numero_caja),
      estado: r.estado === "cerrada" ? "cerrada" : "abierta",
      fecha_apertura: r.fecha_apertura as string,
      fecha_cierre: r.fecha_cierre,
      responsable: r.dueno ? (nombres.get(r.dueno) ?? null) : null,
      apertura: n(r.apertura),
      efectivo: n(r.efectivo),
      transferencia: n(r.transferencia),
      cheque: n(r.cheque),
      otros_medios: n(r.otros_medios),
      contado,
      credito: n(r.credito),
      total_ventas: contado + n(r.credito),
      cobranzas: n(r.cobranzas),
      otros_ingresos: n(r.otros_ingresos),
      egresos: n(r.egresos),
      esperado,
      contado_cierre: contadoCierre,
      diferencia:
        r.diferencia_guardada !== null ? n(r.diferencia_guardada) : contadoCierre === null ? null : contadoCierre - esperado,
      planilla_estado: r.planilla_estado,
      planilla_diferencia: r.planilla_diferencia === null ? null : n(r.planilla_diferencia),
    } satisfies CierreCaja;
  });
}
