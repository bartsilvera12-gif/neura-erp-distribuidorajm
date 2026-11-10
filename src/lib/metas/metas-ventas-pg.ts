import "server-only";
import type { Pool } from "pg";
import { quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { CLAVE_TOTAL, type Ambito, type MetaVentas, type MetasDelMes, type ResumenMes } from "@/lib/metas/metas-ventas";

/**
 * Metas de ventas mensuales (SQL 61). Lo vendido sale de `ventas` (crédito +
 * contado, sin anuladas), por día de Asunción. Para una persona, son las
 * ventas de sus cajas (la caja dice quién vendió).
 */
const TZ = "America/Asuncion";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class MetaError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

async function existe(pool: Pool, schema: string, tabla: string): Promise<boolean> {
  const r = await pool.query<{ t: string | null }>(`SELECT to_regclass($1)::text AS t`, [`${schema}.${tabla}`]);
  return !!r.rows[0]?.t;
}

/** Personas que venden (tienen cajas) y «Total empresa». */
async function ambitos(pool: Pool, schema: string, empresaId: string): Promise<Ambito[]> {
  const out: Ambito[] = [{ clave: CLAVE_TOTAL, nombre: "Total empresa" }];
  if (!(await existe(pool, schema, "usuarios"))) return out;
  const r = await pool.query<{ id: string; nombre: string }>(
    `SELECT u.id::text AS id,
            COALESCE(NULLIF(btrim(to_jsonb(u)->>'nombre'), ''), to_jsonb(u)->>'email', 'Usuario') AS nombre
       FROM ${quoteSchemaTable(schema, "usuarios")} u
      WHERE u.empresa_id = $1::uuid
      ORDER BY 2`,
    [empresaId]
  );
  for (const u of r.rows) out.push({ clave: u.id, nombre: u.nombre });
  return out;
}

/** Lo vendido por día del mes: total de la empresa y por persona (dueño de la caja). */
async function vendidoDelMes(pool: Pool, schema: string, empresaId: string, mes: string) {
  const tV = quoteSchemaTable(schema, "ventas");
  const cajas = await existe(pool, schema, "cajas");
  const cols = cajas
    ? new Set(
        (
          await pool.query<{ c: string }>(
            `SELECT column_name AS c FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'cajas'`,
            [schema]
          )
        ).rows.map((x) => x.c)
      )
    : new Set<string>();
  const dueno = cols.has("abierta_por") ? "k.abierta_por" : cols.has("usuario_id") ? "k.usuario_id" : null;
  const r = await pool.query<{ dia: string; quien: string | null; total: string }>(
    `SELECT to_char((v.fecha AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS dia,
            ${dueno ? `${dueno}::text` : "NULL::text"} AS quien,
            COALESCE(sum(v.total), 0)::text AS total
       FROM ${tV} v
       ${dueno ? `LEFT JOIN ${quoteSchemaTable(schema, "cajas")} k ON k.id = v.caja_id` : ""}
      WHERE v.empresa_id = $1::uuid
        AND COALESCE(v.estado, '') <> 'anulada'
        AND to_char((v.fecha AT TIME ZONE $3)::date, 'YYYY-MM') = $2
      GROUP BY 1, 2`,
    [empresaId, mes, TZ]
  );
  const porClave = new Map<string, Record<string, number>>();
  const sumar = (clave: string, dia: string, v: number) => {
    const m = porClave.get(clave) ?? {};
    m[dia] = (m[dia] ?? 0) + v;
    porClave.set(clave, m);
  };
  for (const x of r.rows) {
    const v = Number(x.total) || 0;
    sumar(CLAVE_TOTAL, x.dia, v);
    if (x.quien) sumar(x.quien, x.dia, v);
  }
  return porClave;
}

export async function metasDelMes(
  pool: Pool,
  schemaRaw: string,
  empresaId: string,
  mes: string,
  esAdmin: boolean
): Promise<MetasDelMes> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const amb = await ambitos(pool, schema, empresaId);
  if (!(await existe(pool, schema, "metas_ventas_mensuales"))) {
    return { disponible: false, mes, hoy, metas: [], ambitos: amb, meses: [], es_admin: esAdmin };
  }
  const tM = quoteSchemaTable(schema, "metas_ventas_mensuales");
  const filas = await pool.query<{ id: string; clave: string; monto: string; nota: string | null }>(
    `SELECT id::text, clave, monto::text, nota FROM ${tM} WHERE empresa_id = $1::uuid AND mes = $2`,
    [empresaId, mes]
  );
  const vendido = await vendidoDelMes(pool, schema, empresaId, mes);
  const nombreDe = new Map(amb.map((a) => [a.clave, a.nombre]));
  const metas: MetaVentas[] = filas.rows
    .map((f) => {
      const porDia = vendido.get(f.clave) ?? {};
      return {
        id: f.id,
        mes,
        clave: f.clave,
        nombre: nombreDe.get(f.clave) ?? "Usuario",
        monto: Number(f.monto),
        nota: f.nota,
        vendido: Object.values(porDia).reduce((s, v) => s + v, 0),
        por_dia: porDia,
      };
    })
    // La de toda la empresa primero, después las personas por nombre.
    .sort((a, b) => (a.clave === CLAVE_TOTAL ? -1 : b.clave === CLAVE_TOTAL ? 1 : a.nombre.localeCompare(b.nombre)));

  // Meses con metas (para la lista): meta total (o la suma de las personas si
  // no hay una de toda la empresa) y lo vendido por la empresa.
  const resumen = await pool.query<{ mes: string; meta_total: string | null; meta_personas: string }>(
    `SELECT mes,
            max(monto) FILTER (WHERE clave = $2)::text AS meta_total,
            COALESCE(sum(monto) FILTER (WHERE clave <> $2), 0)::text AS meta_personas
       FROM ${tM} WHERE empresa_id = $1::uuid GROUP BY mes ORDER BY mes DESC LIMIT 24`,
    [empresaId, CLAVE_TOTAL]
  );
  const vend = await pool.query<{ mes: string; total: string }>(
    `SELECT to_char((fecha AT TIME ZONE $2)::date, 'YYYY-MM') AS mes, COALESCE(sum(total), 0)::text AS total
       FROM ${quoteSchemaTable(schema, "ventas")}
      WHERE empresa_id = $1::uuid AND COALESCE(estado, '') <> 'anulada'
        AND to_char((fecha AT TIME ZONE $2)::date, 'YYYY-MM') = ANY($3::text[])
      GROUP BY 1`,
    [empresaId, TZ, resumen.rows.map((r) => r.mes)]
  );
  const vendPorMes = new Map(vend.rows.map((r) => [r.mes, Number(r.total)]));
  const meses: ResumenMes[] = resumen.rows.map((r) => ({
    mes: r.mes,
    meta: r.meta_total !== null ? Number(r.meta_total) : Number(r.meta_personas),
    vendido: vendPorMes.get(r.mes) ?? 0,
  }));

  return { disponible: true, mes, hoy, metas, ambitos: amb, meses, es_admin: esAdmin };
}

/** Crea o cambia la meta de un mes y un ámbito. */
export async function guardarMeta(
  pool: Pool,
  schemaRaw: string,
  empresaId: string,
  d: { mes: string; clave: string; monto: number; nota: string | null; usuario: string | null }
): Promise<void> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  if (!(await existe(pool, schema, "metas_ventas_mensuales"))) {
    throw new MetaError("Falta correr el SQL 61 (metas de ventas).", 409);
  }
  if (d.clave !== CLAVE_TOTAL && !UUID.test(d.clave)) throw new MetaError("Elegí para quién es la meta.");
  if (!(d.monto > 0)) throw new MetaError("La meta tiene que ser mayor a cero.");
  await pool.query(
    `INSERT INTO ${quoteSchemaTable(schema, "metas_ventas_mensuales")} (empresa_id, mes, clave, monto, nota, creado_por)
     VALUES ($1::uuid, $2, $3, $4::numeric, $5, $6)
     ON CONFLICT (empresa_id, mes, clave)
     DO UPDATE SET monto = EXCLUDED.monto, nota = EXCLUDED.nota, updated_at = now()`,
    [empresaId, d.mes, d.clave, Math.round(d.monto), d.nota, d.usuario]
  );
}

export async function borrarMeta(pool: Pool, schemaRaw: string, empresaId: string, id: string): Promise<void> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const r = await pool.query(
    `DELETE FROM ${quoteSchemaTable(schema, "metas_ventas_mensuales")} WHERE id = $1::uuid AND empresa_id = $2::uuid`,
    [id, empresaId]
  );
  if (!r.rowCount) throw new MetaError("La meta no existe.", 404);
}

/** Copia las metas de un mes a otro (las que ya existan en el destino no se pisan). */
export async function copiarMetas(pool: Pool, schemaRaw: string, empresaId: string, desde: string, hasta: string): Promise<number> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = quoteSchemaTable(schema, "metas_ventas_mensuales");
  const r = await pool.query(
    `INSERT INTO ${t} (empresa_id, mes, clave, monto, nota)
     SELECT empresa_id, $3, clave, monto, nota FROM ${t} WHERE empresa_id = $1::uuid AND mes = $2
     ON CONFLICT (empresa_id, mes, clave) DO NOTHING`,
    [empresaId, desde, hasta]
  );
  return r.rowCount ?? 0;
}
