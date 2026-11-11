import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { queryWithRetry } from "@/lib/supabase/pg-retry";

/**
 * Reporte de Ingresos vs Egresos de caja.
 *
 * Fuente única: `caja_movimientos`. Es lo que el arqueo de caja ya suma, así
 * que el reporte da los mismos números. Ingreso = tipo 'ingreso' (sea de venta,
 * cobranza o "otro ingreso" cargado a mano). Egreso = tipo 'egreso' + 'retiro'.
 * El 'ajuste' se muestra aparte: no infla ni los ingresos ni los egresos.
 *
 * Ventas anuladas: el movimiento de la venta tiene `anulado_at`, así que se
 * descartan con `WHERE anulado_at IS NULL`. Igual criterio en toda el arqueo.
 *
 * Día = `fecha` cuando está cargado (en los manuales), y si no, `created_at`
 * en zona Asunción (los de venta/cobranza vienen con `created_at`).
 */

const TZ = "America/Asuncion";
const num = (v: unknown): number => (v == null ? 0 : Number(v));

export type DetalleMovimiento = {
  id: string;
  dia: string;
  tipo: "ingreso" | "egreso" | "retiro" | "ajuste";
  concepto: string;
  monto: number;
  medio_pago: string | null;
  categoria: string | null;
  usuario_email: string | null;
  manual: boolean;
};

export type ReporteIngresosEgresos = {
  desde: string;
  hasta: string;
  disponible: boolean;
  resumen: {
    ingresos: number;
    egresos: number;
    diferencia: number;
    movimientos: number;
  };
  por_dia: { dia: string; ingresos: number; egresos: number }[];
  ingresos: DetalleMovimiento[];
  egresos: DetalleMovimiento[];
};

function vacio(desde: string, hasta: string, disponible: boolean): ReporteIngresosEgresos {
  return {
    desde, hasta, disponible,
    resumen: { ingresos: 0, egresos: 0, diferencia: 0, movimientos: 0 },
    por_dia: [], ingresos: [], egresos: [],
  };
}

type MovRow = {
  id: string;
  dia: string;
  tipo: string;
  concepto: string;
  monto: string;
  medio_pago: string | null;
  categoria: string | null;
  usuario_email: string | null;
  venta_id: string | null;
  devolucion_id: string | null;
};

export async function getReporteIngresosEgresos(
  schema: string,
  empresaId: string,
  desde: string,
  hasta: string
): Promise<ReporteIngresosEgresos> {
  const pool = getChatPostgresPool();
  if (!pool) return vacio(desde, hasta, false);

  const existe = await queryWithRetry<{ t: string | null }>(
    pool,
    `SELECT to_regclass($1)::text AS t`,
    [`${schema}.caja_movimientos`]
  );
  if (!existe.rows[0]?.t) return vacio(desde, hasta, false);

  const tM = quoteSchemaTable(schema, "caja_movimientos");
  // El día del movimiento: fecha si está (los manuales la cargan), si no, la
  // fecha de creación en Asunción.
  const DIA = `COALESCE(m.fecha, (m.created_at AT TIME ZONE '${TZ}')::date)`;

  const r = await queryWithRetry<MovRow>(
    pool,
    `SELECT m.id, ${DIA}::text AS dia, m.tipo, m.concepto, m.monto::text AS monto,
            m.medio_pago, m.categoria, m.usuario_email, m.venta_id, m.devolucion_id
       FROM ${tM} m
      WHERE m.empresa_id = $1::uuid
        AND m.anulado_at IS NULL
        AND ${DIA} >= $2::date
        AND ${DIA} <= $3::date
      ORDER BY ${DIA} DESC, m.created_at DESC`,
    [empresaId, desde, hasta]
  );

  const detalle: DetalleMovimiento[] = r.rows.map((x) => ({
    id: x.id,
    dia: x.dia,
    tipo: (["ingreso", "egreso", "retiro", "ajuste"].includes(x.tipo) ? x.tipo : "ingreso") as DetalleMovimiento["tipo"],
    concepto: x.concepto,
    monto: num(x.monto),
    medio_pago: x.medio_pago,
    categoria: x.categoria,
    usuario_email: x.usuario_email,
    manual: x.venta_id == null && x.devolucion_id == null,
  }));

  const ingresos = detalle.filter((m) => m.tipo === "ingreso");
  // El retiro también es una salida de caja: se suma a egresos para el
  // "cuánto salió del cajón hoy".
  const egresos = detalle.filter((m) => m.tipo === "egreso" || m.tipo === "retiro");

  const totIng = ingresos.reduce((s, m) => s + m.monto, 0);
  const totEgr = egresos.reduce((s, m) => s + m.monto, 0);

  // Agregado por día para el gráfico.
  const porDia = new Map<string, { ingresos: number; egresos: number }>();
  for (const m of ingresos) {
    const d = porDia.get(m.dia) ?? { ingresos: 0, egresos: 0 };
    d.ingresos += m.monto;
    porDia.set(m.dia, d);
  }
  for (const m of egresos) {
    const d = porDia.get(m.dia) ?? { ingresos: 0, egresos: 0 };
    d.egresos += m.monto;
    porDia.set(m.dia, d);
  }

  return {
    desde, hasta, disponible: true,
    resumen: {
      ingresos: totIng,
      egresos: totEgr,
      diferencia: totIng - totEgr,
      movimientos: ingresos.length + egresos.length,
    },
    por_dia: [...porDia.entries()]
      .map(([dia, v]) => ({ dia, ...v }))
      .sort((a, b) => a.dia.localeCompare(b.dia)),
    ingresos,
    egresos,
  };
}

/**
 * Rango por defecto según el preset: "dia" = hoy, "semana" = últimos 7 días,
 * "mes" = primer día del mes al día de hoy. Siempre en Asunción.
 */
export function rangoPorDefecto(preset: "dia" | "semana" | "mes" = "mes"): { desde: string; hasta: string } {
  const hoyStr = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, m, d] = hoyStr.split("-").map(Number);
  const dd = (n: number) => String(n).padStart(2, "0");
  if (preset === "dia") return { desde: hoyStr, hasta: hoyStr };
  if (preset === "semana") {
    const base = new Date(Date.UTC(y, m - 1, d));
    base.setUTCDate(base.getUTCDate() - 6);
    const desde = `${base.getUTCFullYear()}-${dd(base.getUTCMonth() + 1)}-${dd(base.getUTCDate())}`;
    return { desde, hasta: hoyStr };
  }
  return { desde: `${y}-${dd(m)}-01`, hasta: hoyStr };
}
