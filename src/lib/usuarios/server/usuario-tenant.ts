import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { queryWithRetry } from "@/lib/supabase/pg-retry";

/**
 * El usuario del schema del tenant, resuelto por correo O por el id del
 * catálogo.
 *
 * Atarlo solo al correo fue la causa de que la caja del vendedor mostrara el
 * salón vacío: si el correo de la ficha no es idéntico al del login, el usuario
 * "no existía" y no se llegaba a mirar su reparto. Y atarlo solo al id tampoco
 * alcanza, porque el id del catálogo y el del tenant no siempre coinciden.
 *
 * Las columnas de `usuarios` varían entre schemas —hay bases heredadas sin
 * `rol` o sin `email`—, y nombrar una que falta no devuelve vacío: rompe la
 * consulta con un 42703. Por eso se piden las que están.
 */
export type UsuarioTenant = { id: string; rol: string | null };

export async function resolverUsuarioTenant(opts: {
  schema: string;
  empresaId: string;
  email?: string | null;
  catalogId?: string | null;
}): Promise<UsuarioTenant | null> {
  const pool = getChatPostgresPool();
  if (!pool) return null;
  if (!opts.email && !opts.catalogId) return null;

  const existe = await queryWithRetry<{ u: string | null }>(
    pool,
    `SELECT to_regclass($1)::text AS u`,
    [`${opts.schema}.usuarios`]
  );
  if (!existe.rows[0]?.u) return null;

  const colsQ = await queryWithRetry<{ columna: string }>(
    pool,
    `SELECT column_name AS columna FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'usuarios'`,
    [opts.schema]
  );
  const cols = new Set(colsQ.rows.map((r) => r.columna));

  const condiciones: string[] = [];
  if (cols.has("email")) {
    condiciones.push(`($2::text IS NOT NULL AND lower(btrim(email)) = lower(btrim($2::text)))`);
  }
  condiciones.push(`($3::uuid IS NOT NULL AND id = $3::uuid)`);

  const q = await queryWithRetry<UsuarioTenant>(
    pool,
    `SELECT id, ${cols.has("rol") ? "rol" : "NULL::text AS rol"}
       FROM ${quoteSchemaTable(opts.schema, "usuarios")}
      WHERE empresa_id = $1::uuid AND ( ${condiciones.join(" OR ")} )
      LIMIT 1`,
    [opts.empresaId, opts.email ?? null, opts.catalogId ?? null]
  );
  return q.rows[0] ?? null;
}
