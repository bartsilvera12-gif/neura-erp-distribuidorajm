import "server-only";
import type { Pool } from "pg";
import { quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import type { FilaProducto } from "@/lib/cajas/por-producto";

/**
 * Lo vendido por producto en cada caja, con lo cargado y lo devuelto del camión.
 *
 *  - Vendido: renglones de las ventas de la caja (sin anuladas).
 *  - Cargado / devuelto: movimientos de inventario de la ubicación del camión
 *    de quien abrió la caja, durante el día de la apertura. Cargado = entradas
 *    (compras o transferencias al camión; no cuentan las anulaciones de venta).
 *    Devuelto = salidas por transferencia (el camión devuelve al salón), hasta
 *    lo cargado menos lo vendido ese día.
 *  - Una caja sin camión muestra solo lo vendido.
 *
 * Es solo lectura: no toca ventas ni stock.
 */
export async function ventasPorProducto(
  pool: Pool,
  schemaRaw: string,
  empresaId: string,
  cajaIds: string[]
): Promise<Map<string, FilaProducto[]>> {
  const out = new Map<string, FilaProducto[]>();
  if (cajaIds.length === 0) return out;
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tC = quoteSchemaTable(schema, "cajas");
  const tV = quoteSchemaTable(schema, "ventas");
  const tVi = quoteSchemaTable(schema, "ventas_items");
  const tMi = quoteSchemaTable(schema, "movimientos_inventario");
  const tK = quoteSchemaTable(schema, "camiones");
  const tP = quoteSchemaTable(schema, "productos");
  const tSU = quoteSchemaTable(schema, "inventario_stock_ubicacion");
  const TZ = "America/Asuncion";
  // Efecto de un movimiento sobre el saldo del camión. El conteo guarda AJUSTE
  // con la cantidad en positivo y el signo en la referencia: "(+2)" / "(-2)".
  const NETO = `(CASE WHEN m.tipo = 'ENTRADA' THEN m.cantidad
                       WHEN m.tipo = 'SALIDA' THEN -m.cantidad
                       WHEN m.tipo = 'AJUSTE' THEN (CASE WHEN COALESCE(m.referencia, '') ~ '\\(-' THEN -m.cantidad ELSE m.cantidad END)
                       ELSE 0 END)`;

  const r = await pool.query<{
    caja_id: string;
    con_camion: boolean;
    stock_ahora: string;
    neto_dia: string;
    neto_post: string;
    producto_id: string;
    codigo: string | null;
    producto: string;
    cargada: string;
    devuelta: string;
    vendida: string;
    monto: string;
  }>(
    `WITH cj AS (
       SELECT c.id AS caja_id,
              k.ubicacion_id,
              ((c.fecha_apertura AT TIME ZONE $3)::date)::timestamp AT TIME ZONE $3 AS desde,
              (((c.fecha_apertura AT TIME ZONE $3)::date + 1)::timestamp) AT TIME ZONE $3 AS hasta
         FROM ${tC} c
         LEFT JOIN ${tK} k ON k.empresa_id = c.empresa_id AND k.activo
              AND k.repartidor_id::text = COALESCE(to_jsonb(c)->>'abierta_por', to_jsonb(c)->>'usuario_id')
        WHERE c.empresa_id = $1::uuid AND c.id = ANY($2::uuid[])
     ),
     vend AS (
       SELECT v.caja_id, vi.producto_id,
              max(vi.producto_nombre) AS nombre, max(vi.sku) AS sku,
              sum(vi.cantidad) AS cant, sum(vi.total_linea) AS monto
         FROM ${tVi} vi
         JOIN ${tV} v ON v.id = vi.venta_id
        WHERE v.empresa_id = $1::uuid AND v.caja_id = ANY($2::uuid[])
          AND COALESCE(v.estado, '') <> 'anulada' AND vi.producto_id IS NOT NULL
        GROUP BY v.caja_id, vi.producto_id
     ),
     mov AS (
       SELECT cj.caja_id, m.producto_id,
              max(m.producto_nombre) AS nombre, max(m.producto_sku) AS sku,
              sum(CASE WHEN m.created_at < cj.hasta AND m.tipo = 'ENTRADA' AND m.origen NOT IN ('anulacion', 'devolucion') THEN m.cantidad ELSE 0 END) AS carga,
              sum(CASE WHEN m.created_at < cj.hasta AND m.tipo = 'SALIDA' AND m.origen = 'transferencia' THEN m.cantidad ELSE 0 END) AS dev,
              sum(CASE WHEN m.created_at < cj.hasta THEN ${NETO} ELSE 0 END) AS neto_dia,
              sum(CASE WHEN m.created_at >= cj.hasta THEN ${NETO} ELSE 0 END) AS neto_post
         FROM cj
         JOIN ${tMi} m ON m.empresa_id = $1::uuid AND m.ubicacion_id = cj.ubicacion_id
                      AND m.anulado_at IS NULL AND m.created_at >= cj.desde
        WHERE cj.ubicacion_id IS NOT NULL
        GROUP BY cj.caja_id, m.producto_id
     )
     SELECT COALESCE(vend.caja_id, mov.caja_id) AS caja_id,
            (cj2.ubicacion_id IS NOT NULL) AS con_camion,
            COALESCE(su.stock_actual, 0)::text AS stock_ahora,
            COALESCE(mov.neto_dia, 0)::text AS neto_dia,
            COALESCE(mov.neto_post, 0)::text AS neto_post,
            COALESCE(vend.producto_id, mov.producto_id) AS producto_id,
            COALESCE(NULLIF(btrim(p.sku), ''), vend.sku, mov.sku) AS codigo,
            COALESCE(vend.nombre, mov.nombre, p.nombre, 'Producto') AS producto,
            COALESCE(mov.carga, 0)::text AS cargada,
            COALESCE(mov.dev, 0)::text AS devuelta,
            COALESCE(vend.cant, 0)::text AS vendida,
            COALESCE(vend.monto, 0)::text AS monto
       FROM vend
       FULL JOIN mov ON mov.caja_id = vend.caja_id AND mov.producto_id = vend.producto_id
       LEFT JOIN ${tP} p ON p.id = COALESCE(vend.producto_id, mov.producto_id)
       LEFT JOIN cj cj2 ON cj2.caja_id = COALESCE(vend.caja_id, mov.caja_id)
       LEFT JOIN ${tSU} su ON su.empresa_id = $1::uuid AND su.ubicacion_id = cj2.ubicacion_id
                          AND su.producto_id = COALESCE(vend.producto_id, mov.producto_id)
      ORDER BY 4`,
    [empresaId, cajaIds, TZ]
  );

  for (const x of r.rows) {
    const cargada = Number(x.cargada);
    const vendida = Number(x.vendida);
    // Lo devuelto al salón es lo que realmente se devolvió ese día (antes se
    // recortaba a cargado − vendido y, si el camión devolvía también lo de días
    // anteriores, el saldo mostrado no coincidía con el stock real).
    const devuelta = Number(x.devuelta);
    // Saldo real al final de ese día: stock vivo del camión menos lo que se
    // movió después. Trae lo de días anteriores, ajustes y anulaciones.
    const saldo = x.con_camion
      ? Math.round((Number(x.stock_ahora) - Number(x.neto_post)) * 1000) / 1000
      : undefined;
    const fila: FilaProducto = {
      producto_id: x.producto_id,
      codigo: x.codigo ?? "",
      producto: x.producto,
      cargada,
      devuelta: Math.round(devuelta * 1000) / 1000,
      vendida,
      monto: Number(x.monto),
      ...(saldo !== undefined ? { saldo } : {}),
    };
    if (!fila.cargada && !fila.vendida && !fila.monto) continue;
    const lista = out.get(x.caja_id) ?? [];
    lista.push(fila);
    out.set(x.caja_id, lista);
  }
  return out;
}
