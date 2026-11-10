import "server-only";
import type { Pool } from "pg";
import { quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import {
  CLAVE_TOTAL,
  type Ambito,
  type MetaVentas,
  type MetasDelMes,
  type ProductoMeta,
  type ResumenMes,
  type TipoMeta,
} from "@/lib/metas/metas-ventas";

/**
 * Metas de ventas mensuales (SQL 61; unidades y kilos con el SQL 63). Lo
 * vendido sale de `ventas` (crédito + contado, sin anuladas), por día de
 * Asunción. Para una persona, son las ventas de sus cajas (la caja dice quién
 * vendió). Unidades y kilos salen de las líneas de esas ventas.
 */
const TZ = "America/Asuncion";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Unidades de medida que son kilos (los gramos se pasan a kilos). */
const KILOS = ["KG", "KGS", "KILO", "KILOS"];
const GRAMOS = ["GR", "GRS", "G"];
/** Lo que no es por peso ni por volumen ni por largo se cuenta de a uno. */
const NO_UNIDAD = [...KILOS, ...GRAMOS, "LT", "L", "LTS", "LITRO", "LITROS", "ML", "CC", "METRO", "METROS", "MT", "M"];

export class MetaError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

async function existe(pool: Pool, schema: string, tabla: string): Promise<boolean> {
  const r = await pool.query<{ t: string | null }>(`SELECT to_regclass($1)::text AS t`, [`${schema}.${tabla}`]);
  return !!r.rows[0]?.t;
}

async function columnas(pool: Pool, schema: string, tabla: string): Promise<Set<string>> {
  const r = await pool.query<{ c: string }>(
    `SELECT column_name AS c FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
    [schema, tabla]
  );
  return new Set(r.rows.map((x) => x.c));
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

/** Quién vendió cada venta: el dueño de su caja (o nadie si no se puede saber). */
async function duenoCaja(pool: Pool, schema: string) {
  if (!(await existe(pool, schema, "cajas"))) return null;
  const cols = await columnas(pool, schema, "cajas");
  return cols.has("abierta_por") ? "k.abierta_por" : cols.has("usuario_id") ? "k.usuario_id" : null;
}

type PorClave = Map<string, Record<string, number>>;
const sumarEn = (m: PorClave, clave: string, dia: string, v: number) => {
  const x = m.get(clave) ?? {};
  x[dia] = (x[dia] ?? 0) + v;
  m.set(clave, x);
};

/** Guaraníes vendidos por día del mes: total de la empresa y por persona. */
async function vendidoGs(pool: Pool, schema: string, empresaId: string, mes: string): Promise<PorClave> {
  const dueno = await duenoCaja(pool, schema);
  const r = await pool.query<{ dia: string; quien: string | null; total: string }>(
    `SELECT to_char((v.fecha AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS dia,
            ${dueno ? `${dueno}::text` : "NULL::text"} AS quien,
            COALESCE(sum(v.total), 0)::text AS total
       FROM ${quoteSchemaTable(schema, "ventas")} v
       ${dueno ? `LEFT JOIN ${quoteSchemaTable(schema, "cajas")} k ON k.id = v.caja_id` : ""}
      WHERE v.empresa_id = $1::uuid
        AND COALESCE(v.estado, '') <> 'anulada'
        AND to_char((v.fecha AT TIME ZONE $3)::date, 'YYYY-MM') = $2
      GROUP BY 1, 2`,
    [empresaId, mes, TZ]
  );
  const out: PorClave = new Map();
  for (const x of r.rows) {
    const v = Number(x.total) || 0;
    sumarEn(out, CLAVE_TOTAL, x.dia, v);
    if (x.quien) sumarEn(out, x.quien, x.dia, v);
  }
  return out;
}

/**
 * Unidades y kilos vendidos por día del mes, por producto y por persona.
 * Una caja de 10 cuenta como 10 (las unidades que mueve). Kilos: productos que
 * se venden por kilo (los gramos se pasan a kilos). Unidades: los que se
 * venden de a uno.
 */
async function vendidoCantidades(pool: Pool, schema: string, empresaId: string, mes: string) {
  const out = { unidades: new Map() as PorClave, kilos: new Map() as PorClave, porProducto: new Map<string, PorClave>() };
  if (!(await existe(pool, schema, "ventas_items"))) return out;
  const colsI = await columnas(pool, schema, "ventas_items");
  const cant = colsI.has("unidades") ? "COALESCE(vi.unidades, vi.cantidad)" : "vi.cantidad";
  const dueno = await duenoCaja(pool, schema);
  const r = await pool.query<{ dia: string; quien: string | null; producto_id: string; unidad: string; cantidad: string }>(
    `SELECT to_char((v.fecha AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS dia,
            ${dueno ? `${dueno}::text` : "NULL::text"} AS quien,
            vi.producto_id::text AS producto_id,
            upper(btrim(COALESCE(p.unidad_medida, ''))) AS unidad,
            COALESCE(sum(${cant}), 0)::text AS cantidad
       FROM ${quoteSchemaTable(schema, "ventas_items")} vi
       JOIN ${quoteSchemaTable(schema, "ventas")} v ON v.id = vi.venta_id
       LEFT JOIN ${quoteSchemaTable(schema, "productos")} p ON p.id = vi.producto_id
       ${dueno ? `LEFT JOIN ${quoteSchemaTable(schema, "cajas")} k ON k.id = v.caja_id` : ""}
      WHERE v.empresa_id = $1::uuid
        AND COALESCE(v.estado, '') <> 'anulada'
        AND to_char((v.fecha AT TIME ZONE $3)::date, 'YYYY-MM') = $2
      GROUP BY 1, 2, 3, 4`,
    [empresaId, mes, TZ]
  );
  for (const x of r.rows) {
    const q = Number(x.cantidad) || 0;
    // Por producto: en su propia unidad (kilos si es por kilo o por gramo).
    const kilos = KILOS.includes(x.unidad) ? q : GRAMOS.includes(x.unidad) ? q / 1000 : null;
    const enSuUnidad = kilos ?? q;
    const pp = out.porProducto.get(x.producto_id) ?? new Map();
    sumarEn(pp, CLAVE_TOTAL, x.dia, enSuUnidad);
    if (x.quien) sumarEn(pp, x.quien, x.dia, enSuUnidad);
    out.porProducto.set(x.producto_id, pp);
    const destino = kilos !== null ? out.kilos : NO_UNIDAD.includes(x.unidad) ? null : out.unidades;
    if (!destino) continue;
    sumarEn(destino, CLAVE_TOTAL, x.dia, enSuUnidad);
    if (x.quien) sumarEn(destino, x.quien, x.dia, enSuUnidad);
  }
  return out;
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
    return { disponible: false, mes, hoy, metas: [], ambitos: amb, meses: [], es_admin: esAdmin, con_tipos: false, productos: [] };
  }
  const tM = quoteSchemaTable(schema, "metas_ventas_mensuales");
  const conTipos = (await columnas(pool, schema, "metas_ventas_mensuales")).has("tipo");
  const filas = await pool.query<{
    id: string;
    clave: string;
    monto: string;
    nota: string | null;
    tipo: string;
    producto_id: string | null;
    producto_nombre: string | null;
  }>(
    conTipos
      ? `SELECT m.id::text, m.clave, m.monto::text, m.nota, m.tipo, m.producto_id::text AS producto_id, p.nombre AS producto_nombre
           FROM ${tM} m LEFT JOIN ${quoteSchemaTable(schema, "productos")} p ON p.id = m.producto_id
          WHERE m.empresa_id = $1::uuid AND m.mes = $2`
      : `SELECT id::text, clave, monto::text, nota, 'guaranies' AS tipo, NULL::text AS producto_id, NULL::text AS producto_nombre
           FROM ${tM} WHERE empresa_id = $1::uuid AND mes = $2`,
    [empresaId, mes]
  );
  const vendido = await vendidoGs(pool, schema, empresaId, mes);
  const hayCantidades = filas.rows.some((f) => f.tipo !== "guaranies" || f.producto_id);
  const cantidades = hayCantidades ? await vendidoCantidades(pool, schema, empresaId, mes) : null;
  const nombreDe = new Map(amb.map((a) => [a.clave, a.nombre]));
  const metas: MetaVentas[] = filas.rows
    .map((f) => {
      const tipo: TipoMeta = f.tipo === "unidades" || f.tipo === "kilos" ? f.tipo : "guaranies";
      const fuente: PorClave | undefined = f.producto_id
        ? cantidades?.porProducto.get(f.producto_id)
        : tipo === "unidades"
          ? cantidades?.unidades
          : tipo === "kilos"
            ? cantidades?.kilos
            : vendido;
      const porDia = fuente?.get(f.clave) ?? {};
      return {
        id: f.id,
        mes,
        tipo,
        producto_id: f.producto_id,
        producto_nombre: f.producto_nombre,
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

  // Meses con metas en guaraníes (para la lista): meta total (o la suma de las
  // personas si no hay una de toda la empresa) y lo vendido por la empresa.
  const soloGs = conTipos ? `AND tipo = 'guaranies' AND producto_id IS NULL` : "";
  const resumen = await pool.query<{ mes: string; meta_total: string | null; meta_personas: string }>(
    `SELECT mes,
            max(monto) FILTER (WHERE clave = $2)::text AS meta_total,
            COALESCE(sum(monto) FILTER (WHERE clave <> $2), 0)::text AS meta_personas
       FROM ${tM} WHERE empresa_id = $1::uuid ${soloGs} GROUP BY mes ORDER BY mes DESC LIMIT 24`,
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

  // Productos para elegir (solo quien carga metas).
  let productos: ProductoMeta[] = [];
  if (esAdmin && conTipos) {
    const colsP = await columnas(pool, schema, "productos");
    const p = await pool.query<{ id: string; nombre: string; unidad: string | null }>(
      `SELECT id::text, nombre, unidad_medida AS unidad FROM ${quoteSchemaTable(schema, "productos")}
        WHERE empresa_id = $1::uuid ${colsP.has("activo") ? "AND COALESCE(activo, true)" : ""}
          ${colsP.has("deleted_at") ? "AND deleted_at IS NULL" : ""}
        ORDER BY nombre LIMIT 5000`,
      [empresaId]
    );
    productos = p.rows.map((x) => ({ id: x.id, nombre: x.nombre, unidad: (x.unidad ?? "").trim().toUpperCase() }));
  }

  return { disponible: true, mes, hoy, metas, ambitos: amb, meses, es_admin: esAdmin, con_tipos: conTipos, productos };
}

/** Crea o cambia la meta de un mes, un ámbito, un tipo y (si es por producto) un producto. */
export async function guardarMeta(
  pool: Pool,
  schemaRaw: string,
  empresaId: string,
  d: {
    mes: string;
    clave: string;
    monto: number;
    nota: string | null;
    usuario: string | null;
    tipo: TipoMeta;
    productoId: string | null;
  }
): Promise<void> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  if (!(await existe(pool, schema, "metas_ventas_mensuales"))) {
    throw new MetaError("Falta correr el SQL 61 (metas de ventas).", 409);
  }
  if (d.clave !== CLAVE_TOTAL && !UUID.test(d.clave)) throw new MetaError("Elegí para quién es la meta.");
  if (!(d.monto > 0)) throw new MetaError("La meta tiene que ser mayor a cero.");
  if (d.productoId && !UUID.test(d.productoId)) throw new MetaError("Producto inválido.");
  const t = quoteSchemaTable(schema, "metas_ventas_mensuales");
  const conTipos = (await columnas(pool, schema, "metas_ventas_mensuales")).has("tipo");
  if (!conTipos) {
    if (d.tipo !== "guaranies" || d.productoId) {
      throw new MetaError("Para metas en unidades o kilos falta correr el SQL 63.", 409);
    }
    await pool.query(
      `INSERT INTO ${t} (empresa_id, mes, clave, monto, nota, creado_por)
       VALUES ($1::uuid, $2, $3, $4::numeric, $5, $6)
       ON CONFLICT (empresa_id, mes, clave)
       DO UPDATE SET monto = EXCLUDED.monto, nota = EXCLUDED.nota, updated_at = now()`,
      [empresaId, d.mes, d.clave, Math.round(d.monto), d.nota, d.usuario]
    );
    return;
  }
  // Kilos con un decimal; guaraníes y unidades enteros.
  const monto = d.tipo === "kilos" ? Math.round(d.monto * 10) / 10 : Math.round(d.monto);
  // Una meta por mes + ámbito + tipo + producto: si ya está, se reemplaza.
  const upd = await pool.query(
    `UPDATE ${t} SET monto = $6::numeric, nota = $7, updated_at = now()
      WHERE empresa_id = $1::uuid AND mes = $2 AND clave = $3 AND tipo = $4
        AND producto_id IS NOT DISTINCT FROM $5::uuid`,
    [empresaId, d.mes, d.clave, d.tipo, d.productoId, monto, d.nota]
  );
  if (upd.rowCount) return;
  await pool.query(
    `INSERT INTO ${t} (empresa_id, mes, clave, tipo, producto_id, monto, nota, creado_por)
     VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6::numeric, $7, $8)`,
    [empresaId, d.mes, d.clave, d.tipo, d.productoId, monto, d.nota, d.usuario]
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
  const conTipos = (await columnas(pool, schema, "metas_ventas_mensuales")).has("tipo");
  const r = conTipos
    ? await pool.query(
        `INSERT INTO ${t} (empresa_id, mes, clave, tipo, producto_id, monto, nota)
         SELECT o.empresa_id, $3, o.clave, o.tipo, o.producto_id, o.monto, o.nota FROM ${t} o
          WHERE o.empresa_id = $1::uuid AND o.mes = $2
            AND NOT EXISTS (
              SELECT 1 FROM ${t} d
               WHERE d.empresa_id = o.empresa_id AND d.mes = $3 AND d.clave = o.clave AND d.tipo = o.tipo
                 AND d.producto_id IS NOT DISTINCT FROM o.producto_id)`,
        [empresaId, desde, hasta]
      )
    : await pool.query(
        `INSERT INTO ${t} (empresa_id, mes, clave, monto, nota)
         SELECT empresa_id, $3, clave, monto, nota FROM ${t} WHERE empresa_id = $1::uuid AND mes = $2
         ON CONFLICT (empresa_id, mes, clave) DO NOTHING`,
        [empresaId, desde, hasta]
      );
  return r.rowCount ?? 0;
}
