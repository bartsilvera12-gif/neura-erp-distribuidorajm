import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { esRolAdminEmpresa } from "@/lib/modulos/resolve-effective-modules";

/**
 * La ubicación de inventario del camión asignado a un usuario, si vende de un
 * camión. Sin repartos: el camión es del usuario (Camiones → asignar) y su
 * stock está siempre vivo — sube con las compras a ese camión y baja con sus
 * ventas.
 *
 * El administrador vende de mostrador aunque tenga un camión asignado (misma
 * regla que el catálogo de la caja), así que para él no hay camión.
 */
export async function ubicacionDelCamionDe(opts: {
  schema: string;
  empresaId: string;
  usuario: { id: string; rol: string | null } | null;
}): Promise<string | null> {
  const { schema, empresaId, usuario } = opts;
  if (!usuario || esRolAdminEmpresa(usuario.rol)) return null;
  const pool = getChatPostgresPool();
  if (!pool) return null;
  const col = await pool.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'camiones' AND column_name = 'repartidor_id'`,
    [schema]
  );
  if (col.rows.length === 0) return null;
  const q = await pool.query<{ ubicacion_id: string | null }>(
    `SELECT ubicacion_id FROM ${quoteSchemaTable(schema, "camiones")}
      WHERE empresa_id = $1::uuid AND repartidor_id = $2::uuid AND activo = true
      LIMIT 1`,
    [empresaId, usuario.id]
  );
  return q.rows[0]?.ubicacion_id ?? null;
}
