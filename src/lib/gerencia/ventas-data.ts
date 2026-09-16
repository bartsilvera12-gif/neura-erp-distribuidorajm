import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { queryWithRetry } from "@/lib/supabase/pg-retry";

/**
 * Gerencia de una distribuidora: qué se vendió, qué día, de qué camión y de qué
 * producto.
 *
 * La versión anterior leía `v_mrr` y `v_clientes_recurrentes`: ingreso
 * recurrente y churn, los números de una agencia que cobra suscripciones. Acá
 * no hay suscripciones —hay camiones que salen cargados y vuelven vacíos—, así
 * que esas vistas ni existían y la pantalla tiraba 500.
 *
 * Todo sale de `ventas` y `ventas_items`, que es lo que la caja escribe. Sin
 * vistas intermedias: una vista más es otra cosa que puede quedar desfasada.
 *
 * Las ventas anuladas no cuentan en ningún lado. Y el día es el día de
 * Asunción, no el del servidor: una venta de las 21:00 es de hoy, no de mañana.
 */

const TZ = "America/Asuncion";

const num = (v: unknown): number => (v == null ? 0 : Number(v));

export type ReporteVentas = {
  period: string;
  generado_at: string;
  /** `false` si el schema no tiene `ventas`: la pantalla lo dice en vez de fallar. */
  disponible: boolean;
  resumen: {
    total: number;
    ventas: number;
    ticket_promedio: number;
    contado: number;
    credito: number;
    total_mes_anterior: number;
    variacion_pct: number | null;
    /** Promedio por día con venta, que es lo comparable entre meses. */
    dias_con_venta: number;
    promedio_diario: number;
    mejor_dia: { dia: string; total: number } | null;
  };
  por_dia: { dia: string; total: number; ventas: number }[];
  por_camion: { camion: string; total: number; ventas: number; participacion: number }[];
  por_producto: {
    producto: string;
    unidad: string;
    cantidad: number;
    total: number;
    ventas: number;
    participacion: number;
  }[];
};

function periodoADate(period?: string): string {
  if (period && /^\d{4}-\d{2}$/.test(period)) return `${period}-01`;
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function vacio(period: string, disponible: boolean): ReporteVentas {
  return {
    period,
    generado_at: new Date().toISOString(),
    disponible,
    resumen: {
      total: 0,
      ventas: 0,
      ticket_promedio: 0,
      contado: 0,
      credito: 0,
      total_mes_anterior: 0,
      variacion_pct: null,
      dias_con_venta: 0,
      promedio_diario: 0,
      mejor_dia: null,
    },
    por_dia: [],
    por_camion: [],
    por_producto: [],
  };
}

/** Reporte de un mes. `period` en YYYY-MM; vacío = mes actual. */
export async function getReporteVentas(
  schema: string,
  empresaId: string,
  period?: string
): Promise<ReporteVentas> {
  const ref = periodoADate(period);
  const periodStr = ref.slice(0, 7);

  const pool = getChatPostgresPool();
  if (!pool) return vacio(periodStr, false);

  const existe = await queryWithRetry<{ v: string | null; vi: string | null }>(
    pool,
    `SELECT to_regclass($1)::text AS v, to_regclass($2)::text AS vi`,
    [`${schema}.ventas`, `${schema}.ventas_items`]
  );
  if (!existe.rows[0]?.v) return vacio(periodStr, false);
  const hayItems = existe.rows[0]?.vi !== null;

  // `reparto_id` en ventas es de la migración 06. Sin esa columna no se puede
  // decir de qué camión salió cada venta, pero el resto del reporte sí sale.
  const colQ = await queryWithRetry<{ columna: string }>(
    pool,
    `SELECT column_name AS columna FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'ventas'`,
    [schema]
  );
  const cols = new Set(colQ.rows.map((r) => r.columna));
  const hayReparto =
    cols.has("reparto_id") &&
    (await queryWithRetry<{ r: string | null; c: string | null }>(
      pool,
      `SELECT to_regclass($1)::text AS r, to_regclass($2)::text AS c`,
      [`${schema}.repartos`, `${schema}.camiones`]
    ).then((q) => q.rows[0]?.r !== null && q.rows[0]?.c !== null));

  const tV = quoteSchemaTable(schema, "ventas");
  const tVI = quoteSchemaTable(schema, "ventas_items");
  const tR = quoteSchemaTable(schema, "repartos");
  const tC = quoteSchemaTable(schema, "camiones");
  const tP = quoteSchemaTable(schema, "productos");

  // El día de la venta en hora de Asunción, que es el único que le sirve a
  // quien cerró la caja esa noche.
  const DIA = `((v.fecha AT TIME ZONE '${TZ}')::date)`;
  const VIVA = `v.empresa_id = $1::uuid AND COALESCE(v.estado, '') <> 'anulada'`;
  const DEL_MES = `date_trunc('month', ${DIA}) = date_trunc('month', $2::date)`;

  const [resumenQ, anteriorQ, diaQ] = await Promise.all([
    queryWithRetry<{ total: string; ventas: string; contado: string; credito: string }>(
      pool,
      `SELECT COALESCE(sum(v.total), 0)::text AS total,
              count(*)::text AS ventas,
              COALESCE(sum(v.total) FILTER (WHERE COALESCE(v.tipo_venta,'') <> 'CREDITO'), 0)::text AS contado,
              COALESCE(sum(v.total) FILTER (WHERE COALESCE(v.tipo_venta,'') = 'CREDITO'), 0)::text AS credito
         FROM ${tV} v
        WHERE ${VIVA} AND ${DEL_MES}`,
      [empresaId, ref]
    ),
    queryWithRetry<{ total: string }>(
      pool,
      `SELECT COALESCE(sum(v.total), 0)::text AS total
         FROM ${tV} v
        WHERE ${VIVA}
          AND date_trunc('month', ${DIA}) = date_trunc('month', $2::date - interval '1 month')`,
      [empresaId, ref]
    ),
    queryWithRetry<{ dia: string; total: string; ventas: string }>(
      pool,
      `SELECT to_char(${DIA}, 'YYYY-MM-DD') AS dia,
              COALESCE(sum(v.total), 0)::text AS total,
              count(*)::text AS ventas
         FROM ${tV} v
        WHERE ${VIVA} AND ${DEL_MES}
        GROUP BY 1
        ORDER BY 1`,
      [empresaId, ref]
    ),
  ]);

  const camionQ = hayReparto
    ? await queryWithRetry<{ camion: string; total: string; ventas: string }>(
        pool,
        `SELECT COALESCE(c.alias, '— sin camión —') AS camion,
                COALESCE(sum(v.total), 0)::text AS total,
                count(*)::text AS ventas
           FROM ${tV} v
           LEFT JOIN ${tR} r ON r.id = v.reparto_id
           LEFT JOIN ${tC} c ON c.id = r.camion_id
          WHERE ${VIVA} AND ${DEL_MES}
          GROUP BY 1
          ORDER BY sum(v.total) DESC NULLS LAST`,
        [empresaId, ref]
      )
    : { rows: [] as { camion: string; total: string; ventas: string }[] };

  const productoQ = hayItems
    ? await queryWithRetry<{
        producto: string;
        unidad: string;
        cantidad: string;
        total: string;
        ventas: string;
      }>(
        pool,
        `SELECT COALESCE(NULLIF(btrim(vi.producto_nombre), ''), 'Sin nombre') AS producto,
                COALESCE(NULLIF(btrim(p.unidad_medida), ''), '') AS unidad,
                COALESCE(sum(vi.cantidad), 0)::text AS cantidad,
                COALESCE(sum(vi.total_linea), 0)::text AS total,
                count(DISTINCT v.id)::text AS ventas
           FROM ${tVI} vi
           JOIN ${tV} v ON v.id = vi.venta_id
           LEFT JOIN ${tP} p ON p.id = vi.producto_id
          WHERE ${VIVA} AND ${DEL_MES}
          GROUP BY 1, 2
          ORDER BY sum(vi.total_linea) DESC NULLS LAST
          LIMIT 50`,
        [empresaId, ref]
      )
    : { rows: [] as { producto: string; unidad: string; cantidad: string; total: string; ventas: string }[] };

  const r0 = resumenQ.rows[0];
  const total = num(r0?.total);
  const ventas = num(r0?.ventas);
  const anterior = num(anteriorQ.rows[0]?.total);

  const porDia = diaQ.rows.map((r) => ({
    dia: r.dia,
    total: num(r.total),
    ventas: num(r.ventas),
  }));
  const mejor = porDia.reduce<{ dia: string; total: number } | null>(
    (mejorHasta, d) => (mejorHasta === null || d.total > mejorHasta.total ? { dia: d.dia, total: d.total } : mejorHasta),
    null
  );

  // El promedio se hace sobre los días que hubo venta, no sobre los 30 del mes:
  // un mes a la mitad daría un promedio falsamente bajo.
  const diasConVenta = porDia.filter((d) => d.total > 0).length;

  const conParticipacion = <T extends { total: number }>(filas: T[]) =>
    filas.map((f) => ({ ...f, participacion: total > 0 ? f.total / total : 0 }));

  return {
    period: periodStr,
    generado_at: new Date().toISOString(),
    disponible: true,
    resumen: {
      total,
      ventas,
      ticket_promedio: ventas > 0 ? total / ventas : 0,
      contado: num(r0?.contado),
      credito: num(r0?.credito),
      total_mes_anterior: anterior,
      variacion_pct: anterior > 0 ? ((total - anterior) / anterior) * 100 : null,
      dias_con_venta: diasConVenta,
      promedio_diario: diasConVenta > 0 ? total / diasConVenta : 0,
      mejor_dia: mejor,
    },
    por_dia: porDia,
    por_camion: conParticipacion(
      camionQ.rows.map((r) => ({ camion: r.camion, total: num(r.total), ventas: num(r.ventas) }))
    ),
    por_producto: conParticipacion(
      productoQ.rows.map((r) => ({
        producto: r.producto,
        unidad: r.unidad,
        cantidad: num(r.cantidad),
        total: num(r.total),
        ventas: num(r.ventas),
      }))
    ),
  };
}
