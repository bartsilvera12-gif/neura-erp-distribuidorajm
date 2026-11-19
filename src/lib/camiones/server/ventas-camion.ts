import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { CamionError } from "./movimientos-camion";

/**
 * Las ventas de un camión en un período: las que descontaron mercadería de la
 * ubicación del camión (movimientos de inventario con origen "venta", cuya
 * referencia es el N° de control de la venta). Cada una con sus renglones.
 * Es la misma fuente que la columna "Vendida" del inventario del camión.
 */

export type RenglonVentaCamion = {
  codigo: string | null;
  producto: string;
  cantidad: number;
  precio: number;
  total: number;
};

export type VentaCamion = {
  id: string;
  fecha: string;
  numero: string;
  cliente: string;
  vendedor: string | null;
  total: number;
  estado: string | null;
  tipo_venta: string | null;
  renglones: RenglonVentaCamion[];
};

export async function ventasDelCamion(opts: {
  schema: string;
  empresaId: string;
  camionId: string;
  desde: string; // AAAA-MM-DD, hora de Paraguay
}): Promise<VentaCamion[]> {
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
  if (!ubicacionId) return [];

  const ventasQ = await pool.query<{
    id: string; fecha: string; numero: string; cliente: string | null; vendedor: string | null;
    total: string; estado: string | null; tipo_venta: string | null;
  }>(
    `SELECT v.id::text, v.fecha::text AS fecha, v.numero_control AS numero,
            c.nombre AS cliente, COALESCE(v.vendedor_nombre, v.usuario_nombre) AS vendedor,
            v.total::text AS total, v.estado, v.tipo_venta
       FROM ${quoteSchemaTable(schema, "ventas")} v
       LEFT JOIN ${quoteSchemaTable(schema, "clientes")} c ON c.id = v.cliente_id AND c.empresa_id = v.empresa_id
      WHERE v.empresa_id = $1::uuid
        AND v.fecha >= (($3::date)::timestamp AT TIME ZONE 'America/Asuncion')
        AND v.numero_control IN (
              SELECT m.referencia FROM ${quoteSchemaTable(schema, "movimientos_inventario")} m
               WHERE m.empresa_id = $1::uuid AND m.ubicacion_id = $2::uuid
                 AND lower(m.origen) = 'venta'
                 AND m.fecha >= (($3::date)::timestamp AT TIME ZONE 'America/Asuncion'))
      ORDER BY v.fecha DESC
      LIMIT 300`,
    [empresaId, ubicacionId, opts.desde]
  );
  if (ventasQ.rows.length === 0) return [];

  const itemsQ = await pool.query<{
    venta_id: string; codigo: string | null; producto: string; cantidad: string; precio: string; total: string;
  }>(
    `SELECT i.venta_id::text, i.sku AS codigo, i.producto_nombre AS producto, i.cantidad::text,
            i.precio_venta::text AS precio, i.total_linea::text AS total
       FROM ${quoteSchemaTable(schema, "ventas_items")} i
      WHERE i.empresa_id = $1::uuid AND i.venta_id = ANY($2::uuid[])
      ORDER BY i.created_at`,
    [empresaId, ventasQ.rows.map((r) => r.id)]
  );
  const porVenta = new Map<string, RenglonVentaCamion[]>();
  for (const r of itemsQ.rows) {
    const l = porVenta.get(r.venta_id) ?? [];
    l.push({
      codigo: r.codigo,
      producto: r.producto,
      cantidad: Number(r.cantidad),
      precio: Number(r.precio),
      total: Number(r.total),
    });
    porVenta.set(r.venta_id, l);
  }
  return ventasQ.rows.map((r) => ({
    id: r.id,
    fecha: r.fecha,
    numero: r.numero,
    cliente: r.cliente ?? "Consumidor final",
    vendedor: r.vendedor,
    total: Number(r.total),
    estado: r.estado,
    tipo_venta: r.tipo_venta,
    renglones: porVenta.get(r.id) ?? [],
  }));
}
