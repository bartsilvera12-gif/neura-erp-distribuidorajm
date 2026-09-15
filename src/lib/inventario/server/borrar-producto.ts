import type { PoolClient } from "pg";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * Borrado de un producto.
 *
 * Hay dos casos y conviene no confundirlos:
 *
 *  - Un producto **que nunca se usó** (cargado con un nombre mal escrito, un SKU
 *    repetido, una prueba) se borra de verdad. No hay nada que conservar y
 *    dejarlo desactivado sólo ensucia la lista y el SKU sigue ocupado.
 *
 *  - Un producto **con historial** —lo vendieron, lo compraron, salió en un
 *    reparto— no se borra: se desactiva. Sus ventas de meses anteriores tienen
 *    que seguir diciendo qué se vendió, y borrar la fila dejaría el informe del
 *    mes pasado hablando de un producto que no existe.
 *
 * Desde afuera las dos son "borrar": el producto desaparece del listado y de la
 * caja, porque todo lo que lista productos filtra por `activo = true`.
 */

export type ResultadoBorrado =
  | { ok: true; modo: "eliminado" | "desactivado"; nombre: string }
  | { ok: false; motivo: "no_existe" };

/** `true` si la tabla existe en el schema: no todos los tenants tienen todo. */
async function tablaExiste(client: PoolClient, schema: string, tabla: string): Promise<boolean> {
  const q = await client.query<{ existe: string | null }>(`SELECT to_regclass($1)::text AS existe`, [
    `${schema}.${tabla}`,
  ]);
  return q.rows[0]?.existe != null;
}

/** Tablas donde una fila significa "este producto ya tiene historial". */
const HISTORIAL: { tabla: string; columna: string }[] = [
  { tabla: "ventas_items", columna: "producto_id" },
  { tabla: "compras_items", columna: "producto_id" },
  { tabla: "reparto_stock", columna: "producto_id" },
  { tabla: "notas_credito_items", columna: "producto_id" },
];

/** Tablas que acompañan al producto y se van con él cuando no hay historial. */
const DEPENDIENTES: { tabla: string; columna: string }[] = [
  { tabla: "inventario_stock_ubicacion", columna: "producto_id" },
  { tabla: "productos_stock_ubicacion", columna: "producto_id" },
  { tabla: "producto_presentaciones", columna: "producto_id" },
  { tabla: "camion_objetivos", columna: "producto_id" },
  { tabla: "movimientos_inventario", columna: "producto_id" },
];

export async function borrarProducto(
  schemaRaw: string,
  empresaId: string,
  productoId: string
): Promise<ResultadoBorrado> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Pool no disponible.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const tProd = quoteSchemaTable(schema, "productos");
    // El lock evita la carrera con una venta que esté descontando stock de este
    // mismo producto justo ahora.
    const prod = await client.query<{ nombre: string }>(
      `SELECT nombre FROM ${tProd} WHERE id = $1::uuid AND empresa_id = $2::uuid FOR UPDATE`,
      [productoId, empresaId]
    );
    if (prod.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, motivo: "no_existe" };
    }
    const nombre = prod.rows[0].nombre;

    let tieneHistorial = false;
    for (const ref of HISTORIAL) {
      if (!(await tablaExiste(client, schema, ref.tabla))) continue;
      const t = quoteSchemaTable(schema, ref.tabla);
      const q = await client.query(
        `SELECT 1 FROM ${t} WHERE ${ref.columna} = $1::uuid LIMIT 1`,
        [productoId]
      );
      if (q.rows.length > 0) {
        tieneHistorial = true;
        break;
      }
    }

    if (!tieneHistorial) {
      for (const dep of DEPENDIENTES) {
        if (!(await tablaExiste(client, schema, dep.tabla))) continue;
        const t = quoteSchemaTable(schema, dep.tabla);
        await client.query(`DELETE FROM ${t} WHERE ${dep.columna} = $1::uuid`, [productoId]);
      }
      try {
        await client.query(
          `DELETE FROM ${tProd} WHERE id = $1::uuid AND empresa_id = $2::uuid`,
          [productoId, empresaId]
        );
        await client.query("COMMIT");
        return { ok: true, modo: "eliminado", nombre };
      } catch (err) {
        // Quedó alguna referencia que este código no conoce. No es un error
        // para el usuario: el producto igual tiene que desaparecer de la lista,
        // y desactivarlo hace exactamente eso sin romper lo que lo referencia.
        const code = (err as { code?: string })?.code;
        if (code !== "23503") throw err;
        await client.query("ROLLBACK");
        await client.query("BEGIN");
      }
    }

    await client.query(
      `UPDATE ${tProd} SET activo = false, updated_at = now()
        WHERE id = $1::uuid AND empresa_id = $2::uuid`,
      [productoId, empresaId]
    );
    await client.query("COMMIT");
    return { ok: true, modo: "desactivado", nombre };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
