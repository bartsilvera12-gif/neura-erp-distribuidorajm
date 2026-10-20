import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";

/**
 * Lo que se le hace al stock de un camión desde el módulo Camiones, sin
 * repartos: contarlo (el físico manda) y pasar mercadería al salón.
 *
 * El salón no tiene filas propias: es el total de la empresa menos lo que está
 * arriba de los camiones. Por eso "pasar al salón" solo baja el camión — el
 * total de la empresa no cambia — y contar mueve el camión y el total juntos.
 */

export class CamionError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type Fila = { producto_id: string; nombre: string; sku: string; actual: number };

async function abrir(schema: string, empresaId: string, camionId: string) {
  const pool = getChatPostgresPool();
  if (!pool) throw new CamionError("Pool no disponible.", 500);
  const client = await pool.connect();
  await client.query("BEGIN");
  const cam = await client.query<{ alias: string; ubicacion_id: string | null }>(
    `SELECT alias, ubicacion_id FROM ${quoteSchemaTable(schema, "camiones")}
      WHERE id = $1::uuid AND empresa_id = $2::uuid FOR UPDATE`,
    [camionId, empresaId]
  );
  const row = cam.rows[0];
  if (!row) {
    await client.query("ROLLBACK");
    client.release();
    throw new CamionError("Ese camión no existe.", 404);
  }
  if (!row.ubicacion_id) {
    await client.query("ROLLBACK");
    client.release();
    throw new CamionError(`El camión ${row.alias} no tiene ubicación de inventario.`, 409);
  }
  return { client, alias: row.alias, ubicacionId: row.ubicacion_id };
}

async function stockDelCamion(
  client: { query: (q: string, v: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  schema: string,
  empresaId: string,
  ubicacionId: string,
  ids: string[]
): Promise<Map<string, Fila>> {
  const q = await client.query(
    `SELECT p.id AS producto_id, p.nombre, COALESCE(p.sku, '') AS sku,
            COALESCE(su.stock_actual, 0)::text AS actual
       FROM ${quoteSchemaTable(schema, "productos")} p
       LEFT JOIN ${quoteSchemaTable(schema, "inventario_stock_ubicacion")} su
         ON su.producto_id = p.id AND su.ubicacion_id = $2::uuid AND su.empresa_id = $1::uuid
      WHERE p.empresa_id = $1::uuid AND p.id = ANY($3::uuid[])
      FOR UPDATE OF p`,
    [empresaId, ubicacionId, ids]
  );
  return new Map(
    q.rows.map((r) => [
      String(r.producto_id),
      {
        producto_id: String(r.producto_id),
        nombre: String(r.nombre),
        sku: String(r.sku),
        actual: Number(r.actual),
      },
    ])
  );
}

async function fijarStockCamion(
  client: { query: (q: string, v: unknown[]) => Promise<unknown> },
  schema: string,
  empresaId: string,
  productoId: string,
  ubicacionId: string,
  cantidad: number
) {
  const tSU = quoteSchemaTable(schema, "inventario_stock_ubicacion");
  await client.query(
    `INSERT INTO ${tSU} (empresa_id, producto_id, ubicacion_id, stock_actual)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::numeric)
     ON CONFLICT (empresa_id, producto_id, ubicacion_id)
     DO UPDATE SET stock_actual = EXCLUDED.stock_actual, updated_at = now()`,
    [empresaId, productoId, ubicacionId, cantidad]
  );
}

/**
 * Conteo del camión: lo contado pasa a ser el stock del camión, y la
 * diferencia mueve también el total de la empresa (si en el camión faltan 2,
 * faltan 2 en la empresa). Cada diferencia necesita un motivo.
 */
export async function contarCamion(opts: {
  schema: string;
  empresaId: string;
  camionId: string;
  items: { producto_id: string; contado: number; motivo: string | null }[];
  usuario: string | null;
}): Promise<{ ajustados: number }> {
  const { schema, empresaId, camionId, items } = opts;
  const { client, alias, ubicacionId } = await abrir(schema, empresaId, camionId);
  try {
    const stock = await stockDelCamion(client, schema, empresaId, ubicacionId, items.map((i) => i.producto_id));
    const sinMotivo = items.filter((i) => {
      const f = stock.get(i.producto_id);
      return f && i.contado !== f.actual && !i.motivo;
    });
    if (sinMotivo.length > 0) {
      throw new CamionError(
        `Poné el motivo de la diferencia en: ${sinMotivo.map((i) => stock.get(i.producto_id)!.nombre).join(", ")}.`
      );
    }
    const tP = quoteSchemaTable(schema, "productos");
    const tM = quoteSchemaTable(schema, "movimientos_inventario");
    let ajustados = 0;
    for (const it of items) {
      const f = stock.get(it.producto_id);
      if (!f) throw new CamionError("Hay un producto que no existe.", 404);
      const delta = it.contado - f.actual;
      if (delta === 0) continue;
      ajustados += 1;
      await fijarStockCamion(client, schema, empresaId, it.producto_id, ubicacionId, it.contado);
      await client.query(
        `UPDATE ${tP} SET stock_actual = COALESCE(stock_actual, 0) + $1::numeric, updated_at = now()
          WHERE id = $2::uuid AND empresa_id = $3::uuid`,
        [delta, it.producto_id, empresaId]
      );
      await client.query(
        `INSERT INTO ${tM} (empresa_id, producto_id, producto_nombre, producto_sku,
           tipo, cantidad, origen, referencia, fecha, ubicacion_id, usuario_nombre)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'AJUSTE', $5::numeric, 'rendicion_reparto', $6, now(), $7::uuid, $8)`,
        [
          empresaId,
          it.producto_id,
          f.nombre,
          f.sku,
          Math.abs(delta),
          `Conteo camión ${alias} (${delta > 0 ? "+" : ""}${delta}): ${it.motivo ?? ""}`.trim(),
          ubicacionId,
          opts.usuario,
        ]
      );
    }
    await client.query("COMMIT");
    return { ajustados };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Pasar mercadería del camión al salón. El camión baja; el total de la
 * empresa queda igual, así que el salón (total − camiones) sube solo.
 */
export async function pasarAlSalon(opts: {
  schema: string;
  empresaId: string;
  camionId: string;
  items: { producto_id: string; cantidad: number }[];
  usuario: string | null;
}): Promise<{ movidos: number }> {
  const { schema, empresaId, camionId, items } = opts;
  const { client, alias, ubicacionId } = await abrir(schema, empresaId, camionId);
  try {
    const stock = await stockDelCamion(client, schema, empresaId, ubicacionId, items.map((i) => i.producto_id));
    const tM = quoteSchemaTable(schema, "movimientos_inventario");
    let movidos = 0;
    for (const it of items) {
      const f = stock.get(it.producto_id);
      if (!f) throw new CamionError("Hay un producto que no existe.", 404);
      if (!(it.cantidad > 0)) continue;
      if (it.cantidad > f.actual + 1e-9) {
        throw new CamionError(`El camión tiene ${f.actual} de "${f.nombre}" y querés pasar ${it.cantidad}.`, 409);
      }
      movidos += 1;
      await fijarStockCamion(client, schema, empresaId, it.producto_id, ubicacionId, f.actual - it.cantidad);
      await client.query(
        `INSERT INTO ${tM} (empresa_id, producto_id, producto_nombre, producto_sku,
           tipo, cantidad, origen, referencia, fecha, ubicacion_id, usuario_nombre)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'SALIDA', $5::numeric, 'transferencia', $6, now(), $7::uuid, $8)`,
        [empresaId, it.producto_id, f.nombre, f.sku, it.cantidad, `Camión ${alias} → salón`, ubicacionId, opts.usuario]
      );
      // La entrada al salón, sin ubicación (el salón no la lleva): el par
      // SALIDA/ENTRADA deja el total de la empresa igual en el historial.
      await client.query(
        `INSERT INTO ${tM} (empresa_id, producto_id, producto_nombre, producto_sku,
           tipo, cantidad, origen, referencia, fecha, usuario_nombre)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'ENTRADA', $5::numeric, 'transferencia', $6, now(), $7)`,
        [empresaId, it.producto_id, f.nombre, f.sku, it.cantidad, `Camión ${alias} → salón`, opts.usuario]
      );
    }
    await client.query("COMMIT");
    return { movidos };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}
