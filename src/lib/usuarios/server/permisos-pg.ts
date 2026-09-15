import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { resolverPermisos, type Accion } from "@/lib/usuarios/permisos";

/**
 * Permisos efectivos de un usuario dentro del schema de la empresa.
 *
 * El usuario se resuelve por email y no por el id del catálogo: donde catálogo
 * y datos viven en schemas distintos, ese id no es el de `usuarios` de acá.
 *
 * Si la tabla de excepciones todavía no existe (falta la migración 11), manda
 * el rol solo. Un permiso pendiente de migrar no puede dejar a nadie sin
 * trabajar.
 */
export async function permisosDeUsuario(opts: {
  schema: string;
  empresaId: string;
  email: string | null | undefined;
}): Promise<{ usuarioId: string | null; rol: string | null; permisos: Set<Accion> }> {
  const vacio = { usuarioId: null, rol: null, permisos: resolverPermisos(null, []) };

  const pool = getChatPostgresPool();
  if (!pool || !opts.email) return vacio;

  const tU = quoteSchemaTable(opts.schema, "usuarios");
  const usuarioQ = await queryWithRetry<{ id: string; rol: string | null }>(
    pool,
    `SELECT id, rol FROM ${tU}
      WHERE empresa_id = $1::uuid AND lower(btrim(email)) = lower(btrim($2))
      LIMIT 1`,
    [opts.empresaId, opts.email]
  );
  const usuario = usuarioQ.rows[0];
  if (!usuario) return vacio;

  const existe = await queryWithRetry<{ t: string | null }>(
    pool,
    `SELECT to_regclass($1)::text AS t`,
    [`${opts.schema}.usuario_permisos`]
  );
  if (!existe.rows[0]?.t) {
    return { usuarioId: usuario.id, rol: usuario.rol, permisos: resolverPermisos(usuario.rol, []) };
  }

  const tP = quoteSchemaTable(opts.schema, "usuario_permisos");
  const excepciones = await queryWithRetry<{ accion: string; permitido: boolean }>(
    pool,
    `SELECT accion, permitido FROM ${tP} WHERE usuario_id = $1::uuid`,
    [usuario.id]
  );

  return {
    usuarioId: usuario.id,
    rol: usuario.rol,
    permisos: resolverPermisos(usuario.rol, excepciones.rows),
  };
}

/** `true` si el usuario puede ejecutar la acción. */
export async function puede(
  opts: { schema: string; empresaId: string; email: string | null | undefined },
  accion: Accion
): Promise<boolean> {
  const { permisos } = await permisosDeUsuario(opts);
  return permisos.has(accion);
}
