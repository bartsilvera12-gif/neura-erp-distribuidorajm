import "server-only";
import type { Pool, PoolClient } from "pg";
import { quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import type { Empaque } from "@/lib/inventario/types";

/**
 * Cajas y paquetes de un producto (SQL 57). El stock del producto sigue en
 * unidades: una «Caja x12» es una forma de venderlo o comprarlo que mueve 12.
 */

export class EmpaqueError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type Q = Pick<Pool, "query"> | PoolClient;

export async function hayEmpaques(q: Q, schema: string): Promise<boolean> {
  const r = await q.query<{ t: string | null }>(`SELECT to_regclass($1)::text AS t`, [`${schema}.producto_empaques`]);
  return !!r.rows[0]?.t;
}

const COLS = `id, producto_id, nombre, factor::float AS factor, precio_venta::float AS precio_venta, codigo_barras`;

/** Las presentaciones activas de esos productos (o de todos), agrupadas por producto. */
export async function empaquesPorProducto(
  q: Q,
  schemaRaw: string,
  empresaId: string,
  productoIds?: string[]
): Promise<Map<string, Empaque[]>> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const out = new Map<string, Empaque[]>();
  if (!(await hayEmpaques(q, schema))) return out;
  const { rows } = await q.query<Empaque>(
    `SELECT ${COLS} FROM ${quoteSchemaTable(schema, "producto_empaques")}
      WHERE empresa_id = $1::uuid AND activo
        ${productoIds ? "AND producto_id = ANY($2::uuid[])" : ""}
      ORDER BY factor`,
    productoIds ? [empresaId, productoIds] : [empresaId]
  );
  for (const e of rows) {
    const l = out.get(e.producto_id) ?? [];
    l.push(e);
    out.set(e.producto_id, l);
  }
  return out;
}

export type EmpaqueInput = { nombre: string; factor: number; precio_venta: number | null; codigo_barras: string | null };

export function leerEmpaqueInput(b: Record<string, unknown>): EmpaqueInput {
  const factor = Number(b.factor);
  if (!Number.isFinite(factor) || factor <= 1) throw new EmpaqueError("Poné cuántas unidades trae (más de 1).");
  if (!Number.isInteger(factor)) throw new EmpaqueError("Las unidades por caja van sin decimales.");
  const nombre = String(b.nombre ?? "").trim().slice(0, 80) || `Caja x${factor}`;
  const precioRaw = b.precio_venta;
  const precio = precioRaw === null || precioRaw === undefined || precioRaw === "" ? null : Math.round(Number(precioRaw));
  if (precio !== null && (!Number.isFinite(precio) || precio < 0)) throw new EmpaqueError("Precio inválido.");
  const codigo = String(b.codigo_barras ?? "").trim().slice(0, 60) || null;
  return { nombre, factor, precio_venta: precio, codigo_barras: codigo };
}

async function codigoLibre(pool: Pool, schema: string, empresaId: string, codigo: string | null, salvo: string | null) {
  if (!codigo) return;
  const r = await pool.query(
    `SELECT 1 FROM ${quoteSchemaTable(schema, "productos")} p
      WHERE p.empresa_id = $1::uuid AND p.codigo_barras = $2
        AND COALESCE((to_jsonb(p)->>'activo')::boolean, true)
     UNION ALL
     SELECT 1 FROM ${quoteSchemaTable(schema, "producto_empaques")}
      WHERE empresa_id = $1::uuid AND activo AND codigo_barras = $2 AND ($3::uuid IS NULL OR id <> $3::uuid)
     LIMIT 1`,
    [empresaId, codigo, salvo]
  );
  if (r.rowCount) throw new EmpaqueError("Ese código de barras ya lo tiene otro producto o caja.", 409);
}

export async function crearEmpaque(
  pool: Pool,
  schemaRaw: string,
  empresaId: string,
  productoId: string,
  d: EmpaqueInput
): Promise<Empaque> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  if (!(await hayEmpaques(pool, schema))) throw new EmpaqueError("Falta correr el SQL 57 (cajas de productos).", 409);
  const p = await pool.query(
    `SELECT 1 FROM ${quoteSchemaTable(schema, "productos")} WHERE id = $1::uuid AND empresa_id = $2::uuid`,
    [productoId, empresaId]
  );
  if (!p.rowCount) throw new EmpaqueError("El producto no existe.", 404);
  await codigoLibre(pool, schema, empresaId, d.codigo_barras, null);
  const { rows } = await pool.query<Empaque>(
    `INSERT INTO ${quoteSchemaTable(schema, "producto_empaques")}
       (empresa_id, producto_id, nombre, factor, precio_venta, codigo_barras)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
     RETURNING ${COLS}`,
    [empresaId, productoId, d.nombre, d.factor, d.precio_venta, d.codigo_barras]
  );
  return rows[0];
}

export async function actualizarEmpaque(
  pool: Pool,
  schemaRaw: string,
  empresaId: string,
  productoId: string,
  id: string,
  d: EmpaqueInput
): Promise<Empaque> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  if (!(await hayEmpaques(pool, schema))) throw new EmpaqueError("Falta correr el SQL 57 (cajas de productos).", 409);
  await codigoLibre(pool, schema, empresaId, d.codigo_barras, id);
  const { rows } = await pool.query<Empaque>(
    `UPDATE ${quoteSchemaTable(schema, "producto_empaques")}
        SET nombre = $4, factor = $5, precio_venta = $6, codigo_barras = $7
      WHERE id = $1::uuid AND empresa_id = $2::uuid AND producto_id = $3::uuid AND activo
      RETURNING ${COLS}`,
    [id, empresaId, productoId, d.nombre, d.factor, d.precio_venta, d.codigo_barras]
  );
  if (!rows[0]) throw new EmpaqueError("Esa caja no existe.", 404);
  return rows[0];
}

/** Se da de baja (no se borra): las ventas viejas la siguen nombrando. */
export async function borrarEmpaque(pool: Pool, schemaRaw: string, empresaId: string, productoId: string, id: string) {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  if (!(await hayEmpaques(pool, schema))) throw new EmpaqueError("Falta correr el SQL 57 (cajas de productos).", 409);
  await pool.query(
    `UPDATE ${quoteSchemaTable(schema, "producto_empaques")} SET activo = false
      WHERE id = $1::uuid AND empresa_id = $2::uuid AND producto_id = $3::uuid`,
    [id, empresaId, productoId]
  );
}
