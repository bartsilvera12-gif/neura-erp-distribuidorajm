import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { queryWithRetry } from "@/lib/supabase/pg-retry";

/**
 * Reporte de Ventas por rango de fechas.
 *
 * Se diferencia del de Gerencia en dos cosas: acá el período lo elige el
 * usuario (no es siempre el mes en curso) y se agrega el corte por cliente y
 * por método de pago, que es lo que se usa para cobrar y para cerrar caja.
 *
 * Todo sale de `ventas` y `ventas_items`, que es lo que la caja escribe. Las
 * ventas anuladas no cuentan en ningún lado, y el día es el de Asunción: una
 * venta de las 21:00 es de hoy, no de mañana.
 *
 * El schema puede no tener todas las columnas (`metodo_pago` y `reparto_id`
 * son opcionales según qué migraciones corrieron), así que se consulta qué hay
 * antes de armar las queries: es preferible un reporte con un corte menos a
 * una pantalla que falla entera.
 */

const TZ = "America/Asuncion";
const num = (v: unknown): number => (v == null ? 0 : Number(v));

/**
 * Hoy en Asunción, `YYYY-MM-DD`. No sirve `new Date().toISOString()`: después de
 * las 20:00/21:00 locales el UTC ya es el día siguiente, y el reporte arrancaría
 * mostrando un mes que acá todavía no empezó.
 */
export function hoyEnAsuncion(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

/** Primer y último día del mes en curso en Asunción: el rango por defecto. */
export function mesEnCursoAsuncion(): { desde: string; hasta: string } {
  const [y, m] = hoyEnAsuncion().split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dd = (d: number) => String(d).padStart(2, "0");
  return { desde: `${y}-${dd(m)}-01`, hasta: `${y}-${dd(m)}-${dd(ultimo)}` };
}

export type FilaCorte = { etiqueta: string; total: number; ventas: number; participacion: number };

export type ReporteVentasRango = {
  desde: string;
  hasta: string;
  generado_at: string;
  /** `false` si el schema no tiene `ventas`: la pantalla lo dice en vez de fallar. */
  disponible: boolean;
  resumen: {
    total: number;
    ventas: number;
    ticket_promedio: number;
    contado: number;
    credito: number;
    unidades: number;
    dias_con_venta: number;
    promedio_diario: number;
  };
  por_dia: { dia: string; total: number; ventas: number }[];
  por_cliente: FilaCorte[];
  por_producto: { producto: string; cantidad: number; total: number; participacion: number }[];
  por_metodo: FilaCorte[];
  /** Cortes que este schema no puede calcular, para avisarlo en la pantalla. */
  sin_datos: string[];
};

function vacio(desde: string, hasta: string, disponible: boolean): ReporteVentasRango {
  return {
    desde, hasta, generado_at: new Date().toISOString(), disponible,
    resumen: { total: 0, ventas: 0, ticket_promedio: 0, contado: 0, credito: 0, unidades: 0, dias_con_venta: 0, promedio_diario: 0 },
    por_dia: [], por_cliente: [], por_producto: [], por_metodo: [], sin_datos: [],
  };
}

/** Participación de cada fila sobre el total, para ordenar por peso real. */
function conParticipacion<T extends { total: number }>(filas: T[], total: number): (T & { participacion: number })[] {
  return filas.map((f) => ({ ...f, participacion: total > 0 ? (f.total / total) * 100 : 0 }));
}

export async function getReporteVentasRango(
  schema: string,
  empresaId: string,
  desde: string,
  hasta: string
): Promise<ReporteVentasRango> {
  const pool = getChatPostgresPool();
  if (!pool) return vacio(desde, hasta, false);

  const existe = await queryWithRetry<{ v: string | null; vi: string | null; c: string | null }>(
    pool,
    `SELECT to_regclass($1)::text AS v, to_regclass($2)::text AS vi, to_regclass($3)::text AS c`,
    [`${schema}.ventas`, `${schema}.ventas_items`, `${schema}.clientes`]
  );
  if (!existe.rows[0]?.v) return vacio(desde, hasta, false);
  const hayItems = existe.rows[0]?.vi !== null;
  const hayClientes = existe.rows[0]?.c !== null;

  const colQ = await queryWithRetry<{ columna: string }>(
    pool,
    `SELECT column_name AS columna FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'ventas'`,
    [schema]
  );
  const cols = new Set(colQ.rows.map((r) => r.columna));
  const hayMetodo = cols.has("metodo_pago");

  const sin_datos: string[] = [];
  if (!hayItems) sin_datos.push("por producto");
  if (!hayClientes) sin_datos.push("por cliente");
  if (!hayMetodo) sin_datos.push("por método de pago");

  const tV = quoteSchemaTable(schema, "ventas");
  const tVI = quoteSchemaTable(schema, "ventas_items");
  const tCl = quoteSchemaTable(schema, "clientes");

  const DIA = `((v.fecha AT TIME ZONE '${TZ}')::date)`;
  // El rango incluye ambos extremos: quien pide "del 1 al 30" espera el 30.
  const EN_RANGO = `v.empresa_id = $1::uuid AND COALESCE(v.estado, '') <> 'anulada'
                    AND ${DIA} >= $2::date AND ${DIA} <= $3::date`;
  const p = [empresaId, desde, hasta];

  const [resumenQ, diaQ, clienteQ, productoQ, metodoQ] = await Promise.all([
    queryWithRetry<{ total: string; ventas: string; contado: string; credito: string; dias: string }>(
      pool,
      `SELECT COALESCE(sum(v.total), 0)::text AS total,
              count(*)::text AS ventas,
              COALESCE(sum(v.total) FILTER (WHERE COALESCE(v.tipo_venta,'') <> 'CREDITO'), 0)::text AS contado,
              COALESCE(sum(v.total) FILTER (WHERE COALESCE(v.tipo_venta,'') = 'CREDITO'), 0)::text AS credito,
              count(DISTINCT ${DIA})::text AS dias
         FROM ${tV} v WHERE ${EN_RANGO}`,
      p
    ),
    queryWithRetry<{ dia: string; total: string; ventas: string }>(
      pool,
      `SELECT ${DIA}::text AS dia, COALESCE(sum(v.total),0)::text AS total, count(*)::text AS ventas
         FROM ${tV} v WHERE ${EN_RANGO} GROUP BY 1 ORDER BY 1`,
      p
    ),
    hayClientes
      ? queryWithRetry<{ etiqueta: string; total: string; ventas: string }>(
          pool,
          `SELECT COALESCE(NULLIF(btrim(COALESCE(c.empresa, c.nombre_contacto, c.razon_social, '')), ''), 'Sin nombre') AS etiqueta,
                  COALESCE(sum(v.total),0)::text AS total, count(*)::text AS ventas
             FROM ${tV} v LEFT JOIN ${tCl} c ON c.id = v.cliente_id AND c.empresa_id = v.empresa_id
            WHERE ${EN_RANGO} GROUP BY 1 ORDER BY sum(v.total) DESC NULLS LAST LIMIT 50`,
          p
        )
      : Promise.resolve({ rows: [] as { etiqueta: string; total: string; ventas: string }[] }),
    hayItems
      ? queryWithRetry<{ producto: string; cantidad: string; total: string }>(
          pool,
          `SELECT COALESCE(NULLIF(btrim(i.producto_nombre), ''), 'Sin nombre') AS producto,
                  COALESCE(sum(i.cantidad),0)::text AS cantidad,
                  COALESCE(sum(i.total_linea),0)::text AS total
             FROM ${tVI} i JOIN ${tV} v ON v.id = i.venta_id AND v.empresa_id = i.empresa_id
            WHERE ${EN_RANGO} GROUP BY 1 ORDER BY sum(i.total_linea) DESC NULLS LAST LIMIT 50`,
          p
        )
      : Promise.resolve({ rows: [] as { producto: string; cantidad: string; total: string }[] }),
    hayMetodo
      ? queryWithRetry<{ etiqueta: string; total: string; ventas: string }>(
          pool,
          `SELECT COALESCE(NULLIF(btrim(v.metodo_pago), ''), 'Sin especificar') AS etiqueta,
                  COALESCE(sum(v.total),0)::text AS total, count(*)::text AS ventas
             FROM ${tV} v WHERE ${EN_RANGO} GROUP BY 1 ORDER BY sum(v.total) DESC NULLS LAST`,
          p
        )
      : Promise.resolve({ rows: [] as { etiqueta: string; total: string; ventas: string }[] }),
  ]);

  const r = resumenQ.rows[0];
  const total = num(r?.total);
  const ventas = num(r?.ventas);
  const dias = num(r?.dias);
  const unidades = hayItems
    ? productoQ.rows.reduce((s, x) => s + num(x.cantidad), 0)
    : 0;

  return {
    desde,
    hasta,
    generado_at: new Date().toISOString(),
    disponible: true,
    resumen: {
      total,
      ventas,
      ticket_promedio: ventas > 0 ? total / ventas : 0,
      contado: num(r?.contado),
      credito: num(r?.credito),
      unidades,
      dias_con_venta: dias,
      // Sobre días CON venta, no sobre días del calendario: es lo comparable.
      promedio_diario: dias > 0 ? total / dias : 0,
    },
    por_dia: diaQ.rows.map((x) => ({ dia: x.dia, total: num(x.total), ventas: num(x.ventas) })),
    por_cliente: conParticipacion(
      clienteQ.rows.map((x) => ({ etiqueta: x.etiqueta, total: num(x.total), ventas: num(x.ventas) })),
      total
    ),
    por_producto: conParticipacion(
      productoQ.rows.map((x) => ({ producto: x.producto, cantidad: num(x.cantidad), total: num(x.total) })),
      total
    ),
    por_metodo: conParticipacion(
      metodoQ.rows.map((x) => ({ etiqueta: x.etiqueta, total: num(x.total), ventas: num(x.ventas) })),
      total
    ),
    sin_datos,
  };
}
