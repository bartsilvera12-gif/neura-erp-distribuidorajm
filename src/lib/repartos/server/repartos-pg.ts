import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { queryWithRetry } from "@/lib/supabase/pg-retry";

/**
 * Consultas de repartos. El control de mercadería vive acá y no en cada ruta,
 * para que la fórmula exista una sola vez.
 *
 *   esperado   = cargado − vendido + devuelto
 *   diferencia = retornado − esperado
 */

export const TZ_REPARTOS = "America/Asuncion";

export interface ItemReparto {
  producto_id: string;
  nombre: string;
  unidad: string;
  cargado: number;
  vendido: number;
  devuelto: number;
  esperado: number;
  /** `null` mientras no se contó. 0 contado y "sin contar" no son lo mismo. */
  retornado: number | null;
  diferencia: number | null;
}

export interface RepartoDetalle {
  id: string;
  camion: string;
  responsable: string | null;
  estado: "abierto" | "cerrado";
  fecha: string;
  abierto_at: string;
  cerrado_at: string | null;
  items: ItemReparto[];
  resumen: { productos: number; sin_contar: number; con_diferencia: number };
}

function num(v: string | number | null): number {
  if (v === null) return 0;
  return typeof v === "number" ? v : Number(v);
}

/** `true` si el schema tiene las tablas de repartos (migración 06). */
export async function hayTablasReparto(schema: string): Promise<boolean> {
  const pool = getChatPostgresPool();
  if (!pool) return false;
  const q = await queryWithRetry<{ repartos: string | null; items: string | null }>(
    pool,
    `SELECT to_regclass($1)::text AS repartos, to_regclass($2)::text AS items`,
    [`${schema}.repartos`, `${schema}.reparto_items`]
  );
  const row = q.rows[0];
  return Boolean(row?.repartos) && Boolean(row?.items);
}

type FilaItem = {
  reparto_id: string;
  producto_id: string;
  nombre: string;
  unidad: string;
  cargado: string;
  vendido: string;
  devuelto: string;
  retornado: string | null;
};

type FilaReparto = {
  id: string;
  camion: string;
  responsable: string | null;
  estado: string;
  fecha: string;
  abierto_at: string;
  cerrado_at: string | null;
};

/**
 * Repartos con su control de mercadería: por día, o solo los abiertos.
 */
export async function listarRepartos(opts: {
  schema: string;
  empresaId: string;
  fecha?: string;
  soloAbiertos?: boolean;
}): Promise<RepartoDetalle[]> {
  const pool = getChatPostgresPool();
  if (!pool) return [];

  const tR = quoteSchemaTable(opts.schema, "repartos");
  const tI = quoteSchemaTable(opts.schema, "reparto_items");
  const tP = quoteSchemaTable(opts.schema, "productos");
  const tV = quoteSchemaTable(opts.schema, "ventas");
  const tVI = quoteSchemaTable(opts.schema, "ventas_items");

  const condiciones = ["empresa_id = $1::uuid"];
  const params: unknown[] = [opts.empresaId];
  if (opts.soloAbiertos) {
    condiciones.push("estado = 'abierto'");
  } else if (opts.fecha) {
    params.push(opts.fecha);
    condiciones.push(`fecha = $${params.length}::date`);
  }

  const repartosQ = await queryWithRetry<FilaReparto>(
    pool,
    `SELECT id, camion, responsable, estado, fecha::text AS fecha,
            abierto_at::text AS abierto_at, cerrado_at::text AS cerrado_at
       FROM ${tR}
      WHERE ${condiciones.join(" AND ")}
      ORDER BY abierto_at DESC`,
    params
  );
  if (repartosQ.rows.length === 0) return [];

  const ids = repartosQ.rows.map((r) => r.id);

  // El vendido sale de las ventas estampadas con el reparto. Las anuladas no
  // cuentan: esa mercadería nunca salió del camión.
  const itemsQ = await queryWithRetry<FilaItem>(
    pool,
    `SELECT ri.reparto_id,
            ri.producto_id,
            p.nombre,
            COALESCE(p.unidad_medida, '') AS unidad,
            ri.cargado::text   AS cargado,
            ri.devuelto::text  AS devuelto,
            ri.retornado::text AS retornado,
            COALESCE((
              SELECT sum(vi.cantidad)
                FROM ${tVI} vi
                JOIN ${tV} v ON v.id = vi.venta_id
               WHERE v.reparto_id = ri.reparto_id
                 AND vi.producto_id = ri.producto_id
                 AND COALESCE(v.estado, '') <> 'anulada'
            ), 0)::text AS vendido
       FROM ${tI} ri
       JOIN ${tP} p ON p.id = ri.producto_id
      WHERE ri.reparto_id = ANY($1::uuid[])
      ORDER BY p.nombre`,
    [ids]
  );

  const porReparto = new Map<string, ItemReparto[]>();
  for (const row of itemsQ.rows) {
    const cargado = num(row.cargado);
    const vendido = num(row.vendido);
    const devuelto = num(row.devuelto);
    const esperado = cargado - vendido + devuelto;
    const retornado = row.retornado === null ? null : num(row.retornado);

    const lista = porReparto.get(row.reparto_id) ?? [];
    lista.push({
      producto_id: row.producto_id,
      nombre: row.nombre,
      unidad: row.unidad,
      cargado,
      vendido,
      devuelto,
      esperado,
      retornado,
      diferencia: retornado === null ? null : retornado - esperado,
    });
    porReparto.set(row.reparto_id, lista);
  }

  return repartosQ.rows.map((r) => {
    const items = porReparto.get(r.id) ?? [];
    return {
      id: r.id,
      camion: r.camion,
      responsable: r.responsable,
      estado: r.estado === "cerrado" ? ("cerrado" as const) : ("abierto" as const),
      fecha: r.fecha,
      abierto_at: r.abierto_at,
      cerrado_at: r.cerrado_at,
      items,
      // No se suman cantidades entre productos: kilos y unidades no se pueden
      // sumar, y un total mezclado sería un número sin sentido.
      resumen: {
        productos: items.length,
        sin_contar: items.filter((i) => i.retornado === null).length,
        con_diferencia: items.filter((i) => i.diferencia !== null && i.diferencia !== 0).length,
      },
    };
  });
}
