import "server-only";
import type { Pool, PoolClient } from "pg";
import { quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";

/**
 * Efectivo contado en el ÚLTIMO cierre de caja (de este cajero, o una sin
 * dueño): es la plata que quedó en el cajón y que se "estira" como apertura de
 * la caja siguiente —lo que cierra hoy arranca mañana—.
 *
 * Devuelve 0 si no hay cierre anterior, si el schema no guarda el contado, o si
 * el contado fue 0: no es un valor que haya que arrastrar.
 *
 * El filtro por dueño es el mismo que usan el arqueo y la apertura: la caja es
 * del cajero, así que su apertura toma SU cierre, no el de otro.
 */
export async function saldoCierreAnterior(
  db: Pool | PoolClient,
  schema: string,
  empresaId: string,
  usuarioId?: string | null
): Promise<number> {
  const tC = quoteSchemaTable(schema, "cajas");

  // Columnas que pueden faltar según el schema: sin el contado no hay nada que
  // estirar; `fecha_cierre` sirve para quedarse con el cierre más reciente.
  const colsQ = await db.query<{ c: string }>(
    `SELECT column_name AS c FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'cajas'
        AND column_name IN ('monto_cierre_contado', 'fecha_cierre', 'abierta_por', 'usuario_id')`,
    [schema]
  );
  const cols = new Set(colsQ.rows.map((r) => r.c));
  if (!cols.has("monto_cierre_contado")) return 0;

  const colDueno = cols.has("abierta_por")
    ? "abierta_por"
    : cols.has("usuario_id")
      ? "usuario_id"
      : null;
  const filtroDueno = colDueno && usuarioId ? ` AND (${colDueno} = $2::uuid OR ${colDueno} IS NULL)` : "";
  const orden = cols.has("fecha_cierre") ? "fecha_cierre DESC NULLS LAST" : "fecha_apertura DESC";

  const q = await db.query<{ monto: string | null }>(
    `SELECT monto_cierre_contado::text AS monto
       FROM ${tC}
      WHERE empresa_id = $1::uuid AND estado = 'cerrada'${filtroDueno}
        AND monto_cierre_contado IS NOT NULL
      ORDER BY ${orden}
      LIMIT 1`,
    filtroDueno ? [empresaId, usuarioId] : [empresaId]
  );

  const n = Number(q.rows[0]?.monto ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}
