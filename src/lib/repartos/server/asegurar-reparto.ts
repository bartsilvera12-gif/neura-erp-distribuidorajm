import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";

/**
 * Devuelve el reparto abierto del vendedor; si no hay, lo abre.
 *
 * El vendedor sale con SU camión: no tiene por qué entrar a otra pantalla a
 * declarar todas las mañanas lo mismo. Sin esto, vender sin haber abierto el
 * reparto a mano dejaba la venta sin camión, la mercadería salía del stock
 * general y el cierre del día decía "sin reparto" aunque el camión estuviera
 * en la calle.
 *
 * Solo abre cuando el camión tiene a esa persona asignada (`camiones.repartidor_id`,
 * migración 13). Un administrador vendiendo desde la oficina no tiene camión
 * asignado y su venta sigue siendo de mostrador, como debe ser.
 *
 * Copia el saldo del camión a `reparto_stock.cantidad_inicial`, igual que la
 * apertura manual: el reparto arranca con lo que quedó arriba del cierre
 * anterior.
 */
export async function asegurarRepartoAbierto(
  schema: string,
  empresaId: string,
  usuarioId: string | null | undefined
): Promise<string | null> {
  if (!usuarioId) return null;
  const pool = getChatPostgresPool();
  if (!pool) return null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existe = await client.query<{ r: string | null; c: string | null; s: string | null }>(
      `SELECT to_regclass($1)::text AS r, to_regclass($2)::text AS c, to_regclass($3)::text AS s`,
      [`${schema}.repartos`, `${schema}.camiones`, `${schema}.reparto_stock`]
    );
    if (!existe.rows[0]?.r || !existe.rows[0]?.c) {
      await client.query("ROLLBACK");
      return null;
    }

    const tC = quoteSchemaTable(schema, "camiones");
    const tR = quoteSchemaTable(schema, "repartos");

    // Sin la columna de la migración 13 no hay forma de saber de quién es el
    // camión, y adivinarlo sería peor que no abrir nada.
    const col = await client.query<{ c: string }>(
      `SELECT column_name AS c FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'camiones' AND column_name = 'repartidor_id'`,
      [schema]
    );
    if (col.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    // El camión queda bloqueado: dos ventas simultáneas del mismo vendedor no
    // pueden abrirle dos repartos al mismo camión.
    const camionQ = await client.query<{ id: string; ubicacion_id: string | null }>(
      `SELECT id, ubicacion_id FROM ${tC}
        WHERE empresa_id = $1::uuid AND repartidor_id = $2::uuid AND activo = true
        LIMIT 1
        FOR UPDATE`,
      [empresaId, usuarioId]
    );
    const camion = camionQ.rows[0];
    if (!camion) {
      await client.query("ROLLBACK");
      return null;
    }

    const abiertoQ = await client.query<{ id: string }>(
      `SELECT id FROM ${tR}
        WHERE empresa_id = $1::uuid AND camion_id = $2::uuid AND estado = 'abierto'
        ORDER BY abierto_at DESC
        LIMIT 1`,
      [empresaId, camion.id]
    );
    if (abiertoQ.rows.length > 0) {
      await client.query("COMMIT");
      return abiertoQ.rows[0].id;
    }

    const nuevo = await client.query<{ id: string }>(
      `INSERT INTO ${tR} (empresa_id, camion_id, repartidor_id, fecha)
       VALUES ($1::uuid, $2::uuid, $3::uuid, (now() AT TIME ZONE 'America/Asuncion')::date)
       RETURNING id`,
      [empresaId, camion.id, usuarioId]
    );
    const repartoId = nuevo.rows[0].id;

    // La foto de con qué arranca la jornada. Los saldos en 0 no se fotografían:
    // serían filas de ruido en el control de mercadería.
    if (existe.rows[0]?.s && camion.ubicacion_id) {
      await client.query(
        `INSERT INTO ${quoteSchemaTable(schema, "reparto_stock")}
           (empresa_id, reparto_id, producto_id, unidad_medida, cantidad_inicial)
         SELECT $1::uuid, $2::uuid, su.producto_id,
                COALESCE(NULLIF(p.unidad_medida, ''), 'Unidad'), su.stock_actual
           FROM ${quoteSchemaTable(schema, "inventario_stock_ubicacion")} su
           JOIN ${quoteSchemaTable(schema, "productos")} p ON p.id = su.producto_id
          WHERE su.empresa_id = $1::uuid AND su.ubicacion_id = $3::uuid
            AND su.stock_actual > 0`,
        [empresaId, repartoId, camion.ubicacion_id]
      );
    }

    await client.query("COMMIT");
    return repartoId;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[asegurarRepartoAbierto]", err instanceof Error ? err.message : err);
    return null;
  } finally {
    client.release();
  }
}
