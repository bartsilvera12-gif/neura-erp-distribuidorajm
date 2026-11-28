import type { Pool } from "pg";
import { quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { usuarioDelSchema } from "@/lib/repartos/server/repartos-pg";
import { alcanceRepartos } from "@/lib/usuarios/erp-rol-normalize";

/**
 * Qué ventas a crédito puede ver y cobrar quien está logueado.
 *
 * El administrador (y cualquier rol que no sea vendedor móvil) ve todas. El
 * repartidor ve solo las facturas de SU punto de expedición (el del camión que
 * tiene asignado, ej. 002 → FAC-002-…) y las de sus repartos: no puede ver ni
 * cobrar las de otro camión.
 */
export type AlcanceCobranza = { todas: true } | { todas: false; usuarioId: string; puntos: string[] };

export async function alcanceCobranza(
  pool: Pool,
  opts: { schema: string; empresaId: string; email: string | null | undefined; catalogId: string | null }
): Promise<AlcanceCobranza> {
  const yo = await usuarioDelSchema(opts);
  if (!yo || alcanceRepartos(yo.rol) !== "propios") return { todas: true };

  let puntos: string[] = [];
  try {
    const q = await pool.query<{ p: string }>(
      `SELECT DISTINCT punto_expedicion AS p
         FROM ${quoteSchemaTable(opts.schema, "camiones")}
        WHERE empresa_id = $1::uuid AND repartidor_id = $2::uuid AND activo = true
          AND punto_expedicion IS NOT NULL`,
      [opts.empresaId, yo.id]
    );
    puntos = q.rows.map((r) => r.p.trim().padStart(3, "0"));
  } catch (e) {
    console.error("[cobranzas] alcance:", e instanceof Error ? e.message : e);
  }
  return { todas: false, usuarioId: yo.id, puntos };
}

/** ¿Todas las ventas dadas entran en el alcance de quien cobra? */
export async function ventasEnAlcance(
  db: { query: Pool["query"] },
  schema: string,
  empresaId: string,
  alcance: AlcanceCobranza,
  ventaIds: string[]
): Promise<boolean> {
  if (alcance.todas) return true;
  const q = await db.query(
    `SELECT count(*)::int AS n FROM ${quoteSchemaTable(schema, "ventas")} v
      WHERE v.id = ANY($4::uuid[]) AND v.empresa_id = $1::uuid ${condicionAlcance(schema, 1, 2, 3)}`,
    [empresaId, alcance.usuarioId, alcance.puntos, ventaIds]
  );
  return Number((q.rows[0] as { n: number } | undefined)?.n ?? 0) === ventaIds.length;
}

/**
 * Condición SQL sobre la venta `v` según el alcance. `iEmpresa`, `iUsuario` e
 * `iPuntos` son los números de parámetro ($n) donde van la empresa, el usuario
 * y la lista de puntos.
 */
export function condicionAlcance(schema: string, iEmpresa: number, iUsuario: number, iPuntos: number): string {
  return ` AND (
      v.reparto_id IN (SELECT id FROM ${quoteSchemaTable(schema, "repartos")}
                        WHERE empresa_id = $${iEmpresa}::uuid AND repartidor_id = $${iUsuario}::uuid)
      OR EXISTS (SELECT 1 FROM ${quoteSchemaTable(schema, "facturas")} f
                  WHERE f.id = v.factura_id AND f.punto_expedicion = ANY($${iPuntos}::text[]))
    )`;
}
