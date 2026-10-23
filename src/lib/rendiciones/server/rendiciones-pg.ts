import "server-only";
import type { Pool } from "pg";
import { quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { resolverUsuarioTenant } from "@/lib/usuarios/server/usuario-tenant";

/**
 * Rendiciones (SQL 54): lo que cobró una persona en un período contra lo que
 * entregó.
 *
 * Lo cobrado sale de los movimientos de SUS cajas (`cajas.abierta_por`), los
 * mismos que usa el arqueo: ventas al contado, cobros de ventas a crédito,
 * otros ingresos, menos egresos y retiros; por forma de pago. Si la persona
 * maneja un camión, la rendición es de reparto y lleva el camión.
 */

export class RendicionError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export type Responsable = { id: string; nombre: string; email: string | null };

export type MovimientoRendicion = {
  fecha: string;
  tipo: string;
  clase: "venta_contado" | "cobro_credito" | "otro_ingreso" | "egreso" | "ajuste";
  concepto: string | null;
  medio: string;
  monto: number;
};

export type CalculoRendicion = {
  responsable: Responsable;
  tipo: "reparto" | "cobranza";
  camion: { id: string; alias: string } | null;
  desde: string;
  hasta: string;
  /** Lo cobrado por forma de pago (ingresos − egresos). */
  por_medio: { medio: string; cobrado: number }[];
  resumen: {
    ventas_contado: number;
    cantidad_ventas: number;
    cobros_credito: number;
    cantidad_cobros: number;
    otros_ingresos: number;
    egresos: number;
    /** Vendido a crédito en el período: no entra plata, se informa aparte. */
    ventas_credito: number;
  };
  cobrado_total: number;
  movimientos: MovimientoRendicion[];
  /** Rendición anterior de la misma persona que se pisa con este período. */
  superpuesta: { numero: number; hasta: string } | null;
};

export type Rendicion = {
  id: string;
  numero: number;
  tipo: "reparto" | "cobranza";
  responsable_id: string;
  responsable_nombre: string;
  camion_alias: string | null;
  desde: string;
  hasta: string;
  cobrado_total: number;
  rendido_total: number;
  diferencia: number;
  observaciones: string | null;
  recibido_por: string | null;
  created_at: string;
  detalle?: {
    por_medio: { medio: string; cobrado: number; rendido: number }[];
    resumen: CalculoRendicion["resumen"];
    movimientos: MovimientoRendicion[];
  };
};

async function tablas(pool: Pool, schema: string) {
  const q = await pool.query<{ r: string | null; c: string | null; m: string | null; v: string | null; cam: string | null }>(
    `SELECT to_regclass($1)::text AS r, to_regclass($2)::text AS c, to_regclass($3)::text AS m,
            to_regclass($4)::text AS v, to_regclass($5)::text AS cam`,
    [`${schema}.rendiciones_cobro`, `${schema}.cajas`, `${schema}.caja_movimientos`, `${schema}.ventas`, `${schema}.camiones`]
  );
  return q.rows[0];
}

async function columnaDueno(pool: Pool, schema: string): Promise<string | null> {
  const q = await pool.query<{ c: string }>(
    `SELECT column_name AS c FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'cajas' AND column_name IN ('abierta_por', 'usuario_id')`,
    [schema]
  );
  const cols = new Set(q.rows.map((r) => r.c));
  return cols.has("abierta_por") ? "abierta_por" : cols.has("usuario_id") ? "usuario_id" : null;
}

/** Hasta dónde rindió la última vez: de ahí arranca la próxima. */
export async function ultimaRendicion(
  pool: Pool,
  schemaRaw: string,
  empresaId: string,
  responsableId: string
): Promise<string | null> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  if (!(await tablas(pool, schema)).r) return null;
  const q = await pool.query<{ hasta: string }>(
    `SELECT hasta::text FROM ${quoteSchemaTable(schema, "rendiciones_cobro")}
      WHERE empresa_id = $1::uuid AND responsable_id = $2::uuid ORDER BY hasta DESC LIMIT 1`,
    [empresaId, responsableId]
  );
  return q.rows[0]?.hasta ?? null;
}

export async function calcularRendicion(
  pool: Pool,
  schemaRaw: string,
  empresaId: string,
  responsable: Responsable,
  desde: string,
  hasta: string
): Promise<CalculoRendicion> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = await tablas(pool, schema);
  if (!t.c || !t.m) throw new RendicionError("Este sistema no tiene cajas.", 409);
  if (!(new Date(hasta) >= new Date(desde))) throw new RendicionError("El período está al revés.");
  const dueno = await columnaDueno(pool, schema);
  if (!dueno) throw new RendicionError("Las cajas no guardan quién las abrió: no se puede saber qué cobró cada uno.", 409);

  const tC = quoteSchemaTable(schema, "cajas");
  const tM = quoteSchemaTable(schema, "caja_movimientos");
  const conVentas = !!t.v;
  const movsQ = await pool.query<{
    fecha: string; tipo: string; concepto: string | null; medio: string; monto: string; venta_tipo: string | null; es_venta: boolean;
  }>(
    `SELECT m.created_at::text AS fecha, m.tipo, m.concepto,
            lower(btrim(COALESCE(m.medio_pago, ''))) AS medio, m.monto::text AS monto,
            ${conVentas ? "v.tipo_venta" : "NULL::text"} AS venta_tipo, (m.venta_id IS NOT NULL) AS es_venta
       FROM ${tM} m
       JOIN ${tC} c ON c.id = m.caja_id
       ${conVentas ? `LEFT JOIN ${quoteSchemaTable(schema, "ventas")} v ON v.id = m.venta_id` : ""}
      WHERE m.empresa_id = $1::uuid AND c.${dueno} = $2::uuid
        AND m.anulado_at IS NULL
        AND m.created_at >= $3::timestamptz AND m.created_at <= $4::timestamptz
      ORDER BY m.created_at`,
    [empresaId, responsable.id, desde, hasta]
  );

  const porMedio = new Map<string, number>();
  const resumen: CalculoRendicion["resumen"] = {
    ventas_contado: 0, cantidad_ventas: 0, cobros_credito: 0, cantidad_cobros: 0, otros_ingresos: 0, egresos: 0, ventas_credito: 0,
  };
  const movimientos: MovimientoRendicion[] = movsQ.rows.map((r) => {
    const monto = Number(r.monto);
    const medio = r.medio || "efectivo";
    let clase: MovimientoRendicion["clase"];
    let signo = 1;
    if (r.tipo === "ingreso") {
      if (r.es_venta && r.venta_tipo === "CREDITO") {
        clase = "cobro_credito";
        resumen.cobros_credito += monto;
        resumen.cantidad_cobros++;
      } else if (r.es_venta) {
        clase = "venta_contado";
        resumen.ventas_contado += monto;
        resumen.cantidad_ventas++;
      } else {
        clase = "otro_ingreso";
        resumen.otros_ingresos += monto;
      }
    } else if (r.tipo === "egreso" || r.tipo === "retiro") {
      clase = "egreso";
      signo = -1;
      resumen.egresos += monto;
    } else {
      // Ajuste: el monto ya viene con su signo (como en el arqueo).
      clase = "ajuste";
    }
    porMedio.set(medio, (porMedio.get(medio) ?? 0) + signo * monto);
    return { fecha: r.fecha, tipo: r.tipo, clase, concepto: r.concepto, medio, monto: signo * monto };
  });

  if (conVentas) {
    const cred = await pool.query<{ total: string }>(
      `SELECT COALESCE(sum(v.total), 0)::text AS total
         FROM ${quoteSchemaTable(schema, "ventas")} v JOIN ${tC} c ON c.id = v.caja_id
        WHERE v.empresa_id = $1::uuid AND c.${dueno} = $2::uuid AND v.tipo_venta = 'CREDITO'
          AND COALESCE(v.estado, '') <> 'anulada'
          AND v.fecha >= $3::timestamptz AND v.fecha <= $4::timestamptz`,
      [empresaId, responsable.id, desde, hasta]
    ).catch(() => ({ rows: [{ total: "0" }] }));
    resumen.ventas_credito = Number(cred.rows[0]?.total ?? 0);
  }

  // ¿Maneja un camión? Entonces es la rendición de su reparto.
  let camion: CalculoRendicion["camion"] = null;
  if (t.cam) {
    const tenant = await resolverUsuarioTenant({ schema, empresaId, email: responsable.email, catalogId: responsable.id }).catch(() => null);
    const ids = [responsable.id, tenant?.id].filter(Boolean);
    const cq = await pool.query<{ id: string; alias: string }>(
      `SELECT id, alias FROM ${quoteSchemaTable(schema, "camiones")}
        WHERE empresa_id = $1::uuid AND repartidor_id = ANY($2::uuid[])
        ORDER BY alias LIMIT 1`,
      [empresaId, ids]
    ).catch(() => ({ rows: [] as { id: string; alias: string }[] }));
    camion = cq.rows[0] ?? null;
  }

  let superpuesta: CalculoRendicion["superpuesta"] = null;
  if (t.r) {
    const s = await pool.query<{ numero: number; hasta: string }>(
      `SELECT numero, hasta::text FROM ${quoteSchemaTable(schema, "rendiciones_cobro")}
        WHERE empresa_id = $1::uuid AND responsable_id = $2::uuid AND hasta > $3::timestamptz AND desde < $4::timestamptz
        ORDER BY hasta DESC LIMIT 1`,
      [empresaId, responsable.id, desde, hasta]
    );
    superpuesta = s.rows[0] ? { numero: Number(s.rows[0].numero), hasta: s.rows[0].hasta } : null;
  }

  const orden = ["efectivo", "transferencia", "tarjeta", "cheque", "otro"];
  const rango = (m: string) => (orden.includes(m) ? orden.indexOf(m) : orden.length);
  const por_medio = [...porMedio.entries()]
    .map(([medio, cobrado]) => ({ medio, cobrado }))
    .sort((a, b) => rango(a.medio) - rango(b.medio));
  return {
    responsable,
    tipo: camion ? "reparto" : "cobranza",
    camion,
    desde,
    hasta,
    por_medio,
    resumen,
    cobrado_total: por_medio.reduce((s, m) => s + m.cobrado, 0),
    movimientos,
    superpuesta,
  };
}

/** Guarda la rendición con lo que rindió por forma de pago (lo cobrado se recalcula acá). */
export async function registrarRendicion(
  pool: Pool,
  schemaRaw: string,
  empresaId: string,
  responsable: Responsable,
  d: { desde: string; hasta: string; rendido: Record<string, number>; observaciones: string | null; recibidoPor: string | null }
): Promise<{ id: string; numero: number }> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  if (!(await tablas(pool, schema)).r) throw new RendicionError("Falta correr el SQL 54 (rendiciones).", 409);
  const calc = await calcularRendicion(pool, schema, empresaId, responsable, d.desde, d.hasta);
  if (calc.superpuesta) {
    throw new RendicionError(
      `Ese período se pisa con la rendición N° ${calc.superpuesta.numero} de ${responsable.nombre}. Empezá después de esa.`,
      409
    );
  }
  const medios = new Set([...calc.por_medio.map((m) => m.medio), ...Object.keys(d.rendido)]);
  const porMedio = [...medios].map((medio) => ({
    medio,
    cobrado: calc.por_medio.find((m) => m.medio === medio)?.cobrado ?? 0,
    rendido: Math.max(0, Math.round(Number(d.rendido[medio] ?? 0) || 0)),
  }));
  const rendido = porMedio.reduce((s, m) => s + m.rendido, 0);
  const detalle = { por_medio: porMedio, resumen: calc.resumen, movimientos: calc.movimientos.slice(0, 2000) };

  const tR = quoteSchemaTable(schema, "rendiciones_cobro");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`rendiciones:${schema}:${empresaId}`]);
    const ins = await client.query<{ id: string; numero: number }>(
      `INSERT INTO ${tR} (empresa_id, numero, tipo, responsable_id, responsable_nombre, camion_id, camion_alias,
                          desde, hasta, cobrado_total, rendido_total, diferencia, detalle, observaciones, recibido_por)
       SELECT $1::uuid, COALESCE(max(numero), 0) + 1, $2, $3::uuid, $4, $5::uuid, $6, $7::timestamptz, $8::timestamptz,
              $9::numeric, $10::numeric, $11::numeric, $12::jsonb, $13, $14
         FROM ${tR} WHERE empresa_id = $1::uuid
       RETURNING id, numero`,
      [empresaId, calc.tipo, responsable.id, responsable.nombre, calc.camion?.id ?? null, calc.camion?.alias ?? null,
       d.desde, d.hasta, calc.cobrado_total, rendido, rendido - calc.cobrado_total, JSON.stringify(detalle),
       d.observaciones, d.recibidoPor]
    );
    await client.query("COMMIT");
    return { id: ins.rows[0].id, numero: Number(ins.rows[0].numero) };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}

const COLS = `id, numero, tipo, responsable_id, responsable_nombre, camion_alias, desde::text AS desde, hasta::text AS hasta,
  cobrado_total::float AS cobrado_total, rendido_total::float AS rendido_total, diferencia::float AS diferencia,
  observaciones, recibido_por, created_at::text AS created_at`;

export async function listarRendiciones(
  pool: Pool,
  schemaRaw: string,
  empresaId: string,
  f: { desde: string; hasta: string }
): Promise<{ disponible: boolean; rendiciones: Rendicion[] }> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  if (!(await tablas(pool, schema)).r) return { disponible: false, rendiciones: [] };
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM ${quoteSchemaTable(schema, "rendiciones_cobro")}
      WHERE empresa_id = $1::uuid
        AND (created_at AT TIME ZONE 'America/Asuncion')::date BETWEEN $2::date AND $3::date
      ORDER BY numero DESC LIMIT 1000`,
    [empresaId, f.desde, f.hasta]
  );
  return { disponible: true, rendiciones: rows as Rendicion[] };
}

export async function getRendicion(pool: Pool, schemaRaw: string, empresaId: string, id: string): Promise<Rendicion | null> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  if (!(await tablas(pool, schema)).r) return null;
  const { rows } = await pool.query(
    `SELECT ${COLS}, detalle FROM ${quoteSchemaTable(schema, "rendiciones_cobro")} WHERE empresa_id = $1::uuid AND id = $2::uuid`,
    [empresaId, id]
  );
  return (rows[0] as Rendicion) ?? null;
}
