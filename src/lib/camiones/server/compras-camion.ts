import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { CamionError } from "./movimientos-camion";

/**
 * Las compras de un camión en un período: las que tuvieron al camión de
 * destino (su mercadería subió al camión) o que el camión trajo. Cada una con
 * sus renglones, para desplegarla al tocarla.
 *
 * El destino sale de `compras.destino_ubicacion_id` (SQL 52) y, para las
 * compras de antes, de sus movimientos de inventario con la ubicación del camión.
 */

export type RenglonCompraCamion = {
  codigo: string | null;
  producto: string;
  cantidad: number;
  ingresada: number;
  costo_unitario: number;
  total: number;
};

export type CompraCamion = {
  id: string;
  fecha: string;
  numero: string;
  proveedor: string;
  total: number;
  estado: string | null;
  /** "destino": la mercadería subió al camión; "transporte": la trajo al salón. */
  relacion: "destino" | "transporte";
  renglones: RenglonCompraCamion[];
};

async function columnas(pool: NonNullable<ReturnType<typeof getChatPostgresPool>>, schema: string) {
  const q = await pool.query<{ t: string; c: string }>(
    `SELECT table_name AS t, column_name AS c FROM information_schema.columns
      WHERE table_schema = $1
        AND ((table_name = 'compras' AND column_name IN ('destino_ubicacion_id', 'camion_transporte_id'))
          OR (table_name = 'compra_items' AND column_name = 'cantidad_ingresada'))`,
    [schema]
  );
  const s = new Set(q.rows.map((r) => `${r.t}.${r.c}`));
  return {
    destino: s.has("compras.destino_ubicacion_id"),
    transporte: s.has("compras.camion_transporte_id"),
    ingresada: s.has("compra_items.cantidad_ingresada"),
  };
}

export async function comprasDelCamion(opts: {
  schema: string;
  empresaId: string;
  camionId: string;
  desde: string; // AAAA-MM-DD, hora de Paraguay
}): Promise<CompraCamion[]> {
  const schema = assertAllowedChatDataSchema(opts.schema);
  const pool = getChatPostgresPool();
  if (!pool) throw new CamionError("Pool no disponible.", 500);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.desde)) throw new CamionError("Fecha inválida.");
  const { empresaId } = opts;

  const cam = await pool.query<{ ubicacion_id: string | null }>(
    `SELECT ubicacion_id FROM ${quoteSchemaTable(schema, "camiones")} WHERE id = $1::uuid AND empresa_id = $2::uuid`,
    [opts.camionId, empresaId]
  );
  if (!cam.rows[0]) throw new CamionError("Ese camión no existe.", 404);
  const ubicacionId = cam.rows[0].ubicacion_id;
  const col = await columnas(pool, schema);

  const tC = quoteSchemaTable(schema, "compras");
  const condiciones: string[] = [
    // Compras de antes del SQL 52: el destino se ve en sus movimientos.
    `c.id IN (SELECT m.documento_id FROM ${quoteSchemaTable(schema, "movimientos_inventario")} m
               WHERE m.empresa_id = $1::uuid AND m.documento_tipo = 'compra' AND m.ubicacion_id = $3::uuid)`,
  ];
  if (col.destino) condiciones.push(`c.destino_ubicacion_id = $3::uuid`);
  if (col.transporte) condiciones.push(`c.camion_transporte_id = $4::uuid`);
  const relacion = col.destino
    ? `CASE WHEN c.destino_ubicacion_id = $3::uuid THEN 'destino'
            WHEN ${col.transporte ? "c.camion_transporte_id = $4::uuid" : "false"} THEN 'transporte'
            ELSE 'destino' END`
    : `'destino'`;

  const comprasQ = await pool.query<{
    id: string; fecha: string; numero: string; proveedor: string; total: string; estado: string | null; relacion: "destino" | "transporte";
  }>(
    `SELECT c.id, c.fecha::text AS fecha, COALESCE(NULLIF(c.numero_comprobante, ''), c.numero_control) AS numero,
            c.proveedor_nombre AS proveedor, c.total::text AS total, c.estado, ${relacion} AS relacion
       FROM ${tC} c
      WHERE c.empresa_id = $1::uuid
        AND c.fecha >= (($2::date)::timestamp AT TIME ZONE 'America/Asuncion')
        AND (${condiciones.join(" OR ")})
        -- $4 (el camión) se nombra siempre: sin la columna de transporte quedaría
        -- sin usar y Postgres rechaza la consulta.
        AND $4::uuid IS NOT NULL
      ORDER BY c.fecha DESC
      LIMIT 300`,
    [empresaId, opts.desde, ubicacionId, opts.camionId]
  );
  if (comprasQ.rows.length === 0) return [];

  const ids = comprasQ.rows.map((r) => r.id);
  const itemsQ = await pool.query<{
    compra_id: string; codigo: string | null; producto: string | null; cantidad: string; ingresada: string | null;
    costo_unitario: string; total: string;
  }>(
    `SELECT ci.compra_id, p.sku::text AS codigo, ci.producto_nombre AS producto, ci.cantidad::text,
            ${col.ingresada ? "ci.cantidad_ingresada::text" : "NULL::text"} AS ingresada,
            ci.costo_unitario::text, ci.total_linea::text AS total
       FROM ${quoteSchemaTable(schema, "compra_items")} ci
       LEFT JOIN ${quoteSchemaTable(schema, "productos")} p ON p.id = ci.producto_id AND p.empresa_id = ci.empresa_id
      WHERE ci.empresa_id = $1::uuid AND ci.compra_id = ANY($2::uuid[])
      ORDER BY ci.orden_linea NULLS LAST, ci.created_at`,
    [empresaId, ids]
  );
  const porCompra = new Map<string, RenglonCompraCamion[]>();
  for (const r of itemsQ.rows) {
    const lista = porCompra.get(r.compra_id) ?? [];
    lista.push({
      codigo: r.codigo,
      producto: r.producto ?? "",
      cantidad: Number(r.cantidad),
      ingresada: r.ingresada == null ? Number(r.cantidad) : Number(r.ingresada),
      costo_unitario: Number(r.costo_unitario),
      total: Number(r.total),
    });
    porCompra.set(r.compra_id, lista);
  }
  return comprasQ.rows.map((r) => ({
    id: r.id,
    fecha: r.fecha,
    numero: r.numero,
    proveedor: r.proveedor,
    total: Number(r.total),
    estado: r.estado,
    relacion: r.relacion,
    renglones: porCompra.get(r.id) ?? [],
  }));
}
