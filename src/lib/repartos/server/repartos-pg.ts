import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import type { Camion, ItemReparto, Reparto } from "@/lib/repartos/types";

/**
 * Consultas de repartos, sobre las tablas que el schema ya tenía:
 * `repartos`, `camiones`, `reparto_stock`.
 *
 * Por producto:
 *   esperado = cantidad_inicial − vendido + cantidad_devuelta
 *
 * `cantidad_devuelta` es lo que el cliente rechaza: vuelve en el camión, así
 * que SUMA a lo que debería volver.
 *
 * El vendido se calcula desde `ventas` estampadas con el reparto y no desde
 * `reparto_stock.cantidad_vendida`, que es un acumulado: si algo cargó una
 * venta sin actualizarlo, el acumulado miente y las ventas no.
 */

function num(v: string | number | null): number {
  if (v === null) return 0;
  return typeof v === "number" ? v : Number(v);
}

/** `true` si el schema tiene el dominio de repartos. */
export async function hayTablasReparto(schema: string): Promise<boolean> {
  const pool = getChatPostgresPool();
  if (!pool) return false;
  const q = await queryWithRetry<{ repartos: string | null; stock: string | null }>(
    pool,
    `SELECT to_regclass($1)::text AS repartos, to_regclass($2)::text AS stock`,
    [`${schema}.repartos`, `${schema}.reparto_stock`]
  );
  const row = q.rows[0];
  return Boolean(row?.repartos) && Boolean(row?.stock);
}

type FilaReparto = {
  id: string;
  camion_id: string;
  camion: string;
  repartidor_id: string;
  repartidor: string | null;
  estado: string;
  fecha: string;
  abierto_at: string;
  cerrado_at: string | null;
  merma_kg: string | null;
  notas_cierre: string | null;
};

type FilaItem = {
  reparto_id: string;
  producto_id: string;
  nombre: string;
  unidad: string;
  cargado: string;
  devuelto: string;
  vendido: string;
};

export async function listarRepartos(opts: {
  schema: string;
  empresaId: string;
  fecha?: string;
  soloAbiertos?: boolean;
}): Promise<Reparto[]> {
  const pool = getChatPostgresPool();
  if (!pool) return [];

  const tR = quoteSchemaTable(opts.schema, "repartos");
  const tC = quoteSchemaTable(opts.schema, "camiones");
  const tU = quoteSchemaTable(opts.schema, "usuarios");
  const tS = quoteSchemaTable(opts.schema, "reparto_stock");
  const tP = quoteSchemaTable(opts.schema, "productos");
  const tV = quoteSchemaTable(opts.schema, "ventas");
  const tVI = quoteSchemaTable(opts.schema, "ventas_items");

  const condiciones = ["r.empresa_id = $1::uuid"];
  const params: unknown[] = [opts.empresaId];
  if (opts.soloAbiertos) {
    condiciones.push("r.estado = 'abierto'");
  } else if (opts.fecha) {
    params.push(opts.fecha);
    condiciones.push(`r.fecha = $${params.length}::date`);
  }

  const repartosQ = await queryWithRetry<FilaReparto>(
    pool,
    `SELECT r.id, r.camion_id, c.alias AS camion,
            r.repartidor_id,
            COALESCE(u.nombre, u.email) AS repartidor,
            r.estado, r.fecha::text AS fecha,
            r.abierto_at::text AS abierto_at, r.cerrado_at::text AS cerrado_at,
            r.merma_kg::text AS merma_kg, r.notas_cierre
       FROM ${tR} r
       JOIN ${tC} c ON c.id = r.camion_id
       LEFT JOIN ${tU} u ON u.id = r.repartidor_id
      WHERE ${condiciones.join(" AND ")}
      ORDER BY r.abierto_at DESC`,
    params
  );
  if (repartosQ.rows.length === 0) return [];

  const ids = repartosQ.rows.map((r) => r.id);

  const itemsQ = await queryWithRetry<FilaItem>(
    pool,
    `SELECT rs.reparto_id,
            rs.producto_id,
            p.nombre,
            COALESCE(NULLIF(rs.unidad_medida, ''), p.unidad_medida, '') AS unidad,
            rs.cantidad_inicial::text  AS cargado,
            rs.cantidad_devuelta::text AS devuelto,
            COALESCE((
              SELECT sum(vi.cantidad)
                FROM ${tVI} vi
                JOIN ${tV} v ON v.id = vi.venta_id
               WHERE v.reparto_id = rs.reparto_id
                 AND vi.producto_id = rs.producto_id
                 AND COALESCE(v.estado, '') <> 'anulada'
            ), 0)::text AS vendido
       FROM ${tS} rs
       JOIN ${tP} p ON p.id = rs.producto_id
      WHERE rs.reparto_id = ANY($1::uuid[])
      ORDER BY p.nombre`,
    [ids]
  );

  const porReparto = new Map<string, ItemReparto[]>();
  for (const row of itemsQ.rows) {
    const cargado = num(row.cargado);
    const vendido = num(row.vendido);
    const devuelto = num(row.devuelto);
    const lista = porReparto.get(row.reparto_id) ?? [];
    lista.push({
      producto_id: row.producto_id,
      nombre: row.nombre,
      unidad: row.unidad,
      cargado,
      vendido,
      devuelto,
      esperado: cargado - vendido + devuelto,
    });
    porReparto.set(row.reparto_id, lista);
  }

  return repartosQ.rows.map((r) => ({
    id: r.id,
    camion_id: r.camion_id,
    camion: r.camion,
    repartidor_id: r.repartidor_id,
    repartidor: r.repartidor,
    estado: r.estado === "cerrado" ? ("cerrado" as const) : ("abierto" as const),
    fecha: r.fecha,
    abierto_at: r.abierto_at,
    cerrado_at: r.cerrado_at,
    merma_kg: r.merma_kg === null ? null : num(r.merma_kg),
    notas_cierre: r.notas_cierre,
    items: porReparto.get(r.id) ?? [],
  }));
}

/** Camiones activos de la empresa, para elegir en el alta del reparto. */
export async function listarCamiones(opts: {
  schema: string;
  empresaId: string;
}): Promise<Camion[]> {
  const pool = getChatPostgresPool();
  if (!pool) return [];

  const tC = quoteSchemaTable(opts.schema, "camiones");
  const q = await queryWithRetry<Camion>(
    pool,
    `SELECT id, alias, patente FROM ${tC}
      WHERE empresa_id = $1::uuid AND activo = true
      ORDER BY alias`,
    [opts.empresaId]
  );
  return q.rows;
}
