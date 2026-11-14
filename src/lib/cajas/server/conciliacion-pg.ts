import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * Conciliación de caja de un día: separa lo que sale (egresos), los cortes de
 * efectivo, lo que entra de afuera (rendiciones) y arma el efectivo esperado
 * con la MISMA cuenta que el arqueo (apertura + sencillo + ingresos − salidas
 * + ajustes, solo efectivo). Solo lectura: no cambia ningún dato.
 *
 * Los cobros de ventas (venta_id) se cuentan una sola vez, como "ventas"; los
 * ingresos cargados a mano son rendiciones/otros ingresos y nunca se suman otra
 * vez a las ventas.
 */

const TZ = "America/Asuncion";
const num = (v: unknown): number => (v == null ? 0 : Number(v));

export type MovConc = {
  id: string;
  fecha: string; // AAAA-MM-DD del movimiento (Asunción)
  hora: string; // HH:MM
  concepto: string;
  monto: number;
  medio: string;
  responsable: string | null;
  /** El movimiento tiene una fecha distinta al día de la caja: explica diferencias entre días. */
  otro_dia: boolean;
  tipo: string;
  /** Una rendición/ingreso externo identificado con un camión; null = otros. */
  grupo?: string;
};

export type CajaConc = {
  id: string;
  numero_caja: number;
  estado: string;
  apertura: number;
  sencillo: number;
  ventas_efectivo: number;
  ventas_otros_medios: number;
  egresos: MovConc[];
  cortes: MovConc[];
  ingresos_externos: MovConc[];
  ajustes: MovConc[];
  totales: {
    egresos: number;
    cortes: number;
    ingresos_externos_efectivo: number;
    ingresos_externos_otros: number;
    ajustes: number;
    efectivo_ingresado: number;
    esperado: number;
    contado: number | null;
    diferencia: number | null;
  };
};

export type Conciliacion = {
  fecha: string;
  cajas: CajaConc[];
  consolidado: {
    salon_efectivo: number;
    salon_otros_medios: number;
    camiones: { nombre: string; efectivo: number; otros: number }[];
    otros_externos: { efectivo: number; otros: number };
    total_general: number;
  };
};

const esCorteConcepto = (c: string) => /corte|dep[oó]sito|cierre/i.test(c);

const sinTilde = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function distancia(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

type CamionTokens = { nombre: string; numero: string | null; tokens: string[] };

function camionDe(concepto: string, camiones: CamionTokens[]): string | null {
  const c = sinTilde(concepto);
  const palabras = c.split(/[^a-z0-9]+/).filter(Boolean);
  const num = /camion\s*([0-9]+)/.exec(c)?.[1];
  for (const cam of camiones) {
    if (num && cam.numero === num) return cam.nombre;
    for (const t of cam.tokens) {
      for (const p of palabras) {
        if (p === t) return cam.nombre;
        if (t.length >= 6 && p.length >= 5 && distancia(p, t) <= 2) return cam.nombre;
      }
    }
  }
  return null;
}

export async function getConciliacionCaja(schemaRaw: string, empresaId: string, fecha: string): Promise<Conciliacion> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Pool no disponible.");
  const tC = quoteSchemaTable(schema, "cajas");
  const tM = quoteSchemaTable(schema, "caja_movimientos");

  const colsQ = await queryWithRetry<{ c: string }>(
    pool,
    `SELECT column_name AS c FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'cajas'`,
    [schema]
  );
  const cols = new Set(colsQ.rows.map((r) => r.c));

  const cajasQ = await queryWithRetry<{
    id: string; numero_caja: number; estado: string; monto_apertura: string; sencillo: string;
    contado: string | null; diferencia: string | null;
  }>(
    pool,
    `SELECT id, numero_caja, estado, monto_apertura::text AS monto_apertura,
            ${cols.has("sencillo") ? "sencillo::text" : "'0'"} AS sencillo,
            monto_cierre_contado::text AS contado, diferencia::text AS diferencia
       FROM ${tC}
      WHERE empresa_id = $1::uuid
        AND ( (fecha_apertura AT TIME ZONE $2)::date = $3::date
              OR (estado = 'abierta' AND (fecha_apertura AT TIME ZONE $2)::date <= $3::date) )
      ORDER BY fecha_apertura`,
    [empresaId, TZ, fecha]
  );

  // Camiones y su repartidor, para identificar a quién pertenece cada rendición.
  const camiones: CamionTokens[] = [];
  try {
    const camQ = await queryWithRetry<{ alias: string; repartidor: string | null; ubicacion: string | null }>(
      pool,
      `SELECT c.alias, u.nombre AS repartidor, ub.nombre AS ubicacion
         FROM ${quoteSchemaTable(schema, "camiones")} c
         LEFT JOIN ${quoteSchemaTable(schema, "usuarios")} u ON u.id = c.repartidor_id
         LEFT JOIN ${quoteSchemaTable(schema, "inventario_ubicaciones")} ub ON ub.id = c.ubicacion_id
        WHERE c.empresa_id = $1::uuid
        ORDER BY c.alias`,
      [empresaId]
    );
    for (const r of camQ.rows) {
      const texto = sinTilde(`${r.alias ?? ""} ${r.repartidor ?? ""} ${r.ubicacion ?? ""}`);
      const numero = /camion\s*([0-9]+)/.exec(texto)?.[1] ?? null;
      const tokens = [...new Set(texto.split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && t !== "camion"))];
      camiones.push({ nombre: numero ? `Camión ${numero}` : (r.alias ?? "Camión").trim(), numero, tokens });
    }
  } catch {
    // Sin tabla de camiones: todas las rendiciones van a "otros ingresos externos".
  }

  const ids = cajasQ.rows.map((c) => c.id);
  const movs = ids.length
    ? (
        await queryWithRetry<{
          id: string; caja_id: string; tipo: string; concepto: string | null; medio: string; monto: string;
          es_venta: boolean; fecha: string; hora: string; responsable: string | null;
        }>(
          pool,
          `SELECT id, caja_id, tipo, concepto, lower(btrim(COALESCE(medio_pago, ''))) AS medio, monto::text AS monto,
                  (venta_id IS NOT NULL) AS es_venta,
                  to_char(created_at AT TIME ZONE $3, 'YYYY-MM-DD') AS fecha,
                  to_char(created_at AT TIME ZONE $3, 'HH24:MI') AS hora,
                  usuario_email AS responsable
             FROM ${tM}
            WHERE empresa_id = $1::uuid AND caja_id = ANY($2::uuid[]) AND anulado_at IS NULL
            ORDER BY created_at`,
          [empresaId, ids, TZ]
        )
      ).rows
    : [];

  const cajas: CajaConc[] = cajasQ.rows.map((c) => {
    const propios = movs.filter((m) => m.caja_id === c.id);
    const apertura = num(c.monto_apertura);
    const sencillo = num(c.sencillo);
    let ventasEf = 0;
    let ventasOtros = 0;
    const egresos: MovConc[] = [];
    const cortes: MovConc[] = [];
    const externos: MovConc[] = [];
    const ajustes: MovConc[] = [];

    for (const m of propios) {
      if (m.es_venta) {
        if (m.tipo === "ingreso") {
          if (m.medio === "efectivo") ventasEf += num(m.monto);
          else ventasOtros += num(m.monto);
        }
        continue;
      }
      const concepto = m.concepto?.trim() || "Sin concepto";
      const base: MovConc = {
        id: m.id, fecha: m.fecha, hora: m.hora, concepto, monto: num(m.monto), medio: m.medio,
        responsable: m.responsable, otro_dia: m.fecha !== fecha, tipo: m.tipo,
      };
      if (m.tipo === "retiro" || (m.tipo === "egreso" && esCorteConcepto(concepto))) cortes.push(base);
      else if (m.tipo === "egreso") egresos.push(base);
      else if (m.tipo === "ingreso") externos.push({ ...base, grupo: camionDe(concepto, camiones) ?? "" });
      else if (m.tipo === "ajuste") ajustes.push(base);
    }

    const ef = (l: MovConc[]) => l.filter((x) => x.medio === "efectivo").reduce((s, x) => s + x.monto, 0);
    const todo = (l: MovConc[]) => l.reduce((s, x) => s + x.monto, 0);
    const extEf = ef(externos);
    const extOtros = todo(externos) - extEf;
    const efectivoIngresado = ventasEf + extEf;
    // Misma cuenta que el arqueo: egresos y cortes salen del efectivo una sola vez.
    const esperado = apertura + sencillo + efectivoIngresado - ef(egresos) - ef(cortes) + ef(ajustes);
    const contado = c.contado === null ? null : num(c.contado);
    return {
      id: c.id,
      numero_caja: Number(c.numero_caja),
      estado: c.estado,
      apertura,
      sencillo,
      ventas_efectivo: ventasEf,
      ventas_otros_medios: ventasOtros,
      egresos,
      cortes,
      ingresos_externos: externos,
      ajustes,
      totales: {
        egresos: ef(egresos),
        cortes: ef(cortes),
        ingresos_externos_efectivo: extEf,
        ingresos_externos_otros: extOtros,
        ajustes: ef(ajustes),
        efectivo_ingresado: efectivoIngresado,
        esperado,
        contado,
        diferencia: c.diferencia !== null ? num(c.diferencia) : contado === null ? null : contado - esperado,
      },
    };
  });

  // Consolidado: cada cobro entra en UN solo cuadro (ventas del salón, camión u otros).
  const porCamion = new Map<string, { efectivo: number; otros: number }>();
  const otros = { efectivo: 0, otros: 0 };
  let salonEf = 0;
  let salonOtros = 0;
  for (const c of cajas) {
    salonEf += c.ventas_efectivo;
    salonOtros += c.ventas_otros_medios;
    for (const e of c.ingresos_externos) {
      const destino = e.grupo ? (porCamion.get(e.grupo) ?? { efectivo: 0, otros: 0 }) : otros;
      if (e.medio === "efectivo") destino.efectivo += e.monto;
      else destino.otros += e.monto;
      if (e.grupo) porCamion.set(e.grupo, destino);
    }
  }
  const lista = camiones.map((c) => ({ nombre: c.nombre, ...(porCamion.get(c.nombre) ?? { efectivo: 0, otros: 0 }) }));
  const total =
    salonEf + salonOtros + lista.reduce((s, x) => s + x.efectivo + x.otros, 0) + otros.efectivo + otros.otros;

  return {
    fecha,
    cajas,
    consolidado: {
      salon_efectivo: salonEf,
      salon_otros_medios: salonOtros,
      camiones: lista,
      otros_externos: otros,
      total_general: total,
    },
  };
}
