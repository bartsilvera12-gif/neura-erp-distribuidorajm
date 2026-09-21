import type { PoolClient } from "pg";
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresa } from "@/lib/modulos/resolve-effective-modules";
import { ACCIONES, esAccion, permisosDeRol, resolverPermisos } from "@/lib/usuarios/permisos";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Permisos por acción de un usuario.
 *
 * Solo un administrador los lee y los escribe: si el propio usuario pudiera
 * editarlos, el permiso no sería un permiso.
 */

async function contexto(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuthWithRol(request);
  if (!ctx) return { error: NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 }) };
  if (!esRolAdminEmpresa(ctx.auth.rol)) {
    return {
      error: NextResponse.json(errorResponse("Solo un administrador cambia los permisos."), {
        status: 403,
      }),
    };
  }
  const empresaId = ctx.auth.empresa_id;
  const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
  return { empresaId, schema };
}

/** GET — acciones del catálogo con su valor efectivo y el default del rol. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const c = await contexto(request);
    if ("error" in c) return c.error;

    const { id } = await context.params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json(errorResponse("Usuario inválido."), { status: 400 });
    }

    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

    const tU = quoteSchemaTable(c.schema, "usuarios");
    const usuarioQ = await queryWithRetry<{ rol: string | null }>(
      pool,
      `SELECT rol FROM ${tU} WHERE id = $1::uuid AND empresa_id = $2::uuid`,
      [id, c.empresaId]
    );
    if (usuarioQ.rows.length === 0) {
      return NextResponse.json(errorResponse("Usuario no encontrado."), { status: 404 });
    }
    const rol = usuarioQ.rows[0].rol;

    const existe = await queryWithRetry<{ t: string | null }>(
      pool,
      `SELECT to_regclass($1)::text AS t`,
      [`${c.schema}.usuario_permisos`]
    );
    const disponible = Boolean(existe.rows[0]?.t);

    let excepciones: { accion: string; permitido: boolean }[] = [];
    if (disponible) {
      const tP = quoteSchemaTable(c.schema, "usuario_permisos");
      const q = await queryWithRetry<{ accion: string; permitido: boolean }>(
        pool,
        `SELECT accion, permitido FROM ${tP} WHERE usuario_id = $1::uuid`,
        [id]
      );
      excepciones = q.rows;
    }

    const efectivos = resolverPermisos(rol, excepciones);
    const porRol = permisosDeRol(rol);

    return NextResponse.json(
      successResponse({
        disponible,
        rol,
        permisos: ACCIONES.map((accion) => ({
          accion,
          permitido: efectivos.has(accion),
          por_defecto: porRol.has(accion),
        })),
      })
    );
  } catch (err) {
    console.error("[permisos GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los permisos."), { status: 500 });
  }
}

/**
 * PUT — guarda los permisos. Body: { permisos: [{accion, permitido}] }
 *
 * Solo se guardan las diferencias contra el rol: así, cambiarle el rol a alguien
 * más adelante le mueve los permisos con él, en vez de quedar congelado en lo
 * que se marcó una vez.
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

  let client: PoolClient | null = null;
  try {
    const c = await contexto(request);
    if ("error" in c) return c.error;

    const { id } = await context.params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json(errorResponse("Usuario inválido."), { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const raw = body?.permisos;
    if (!Array.isArray(raw)) {
      return NextResponse.json(errorResponse("Permisos inválidos."), { status: 400 });
    }

    const pedidos = new Map<string, boolean>();
    for (const it of raw) {
      if (!it || typeof it !== "object") continue;
      const o = it as Record<string, unknown>;
      const accion = String(o.accion ?? "");
      if (!esAccion(accion)) continue;
      pedidos.set(accion, o.permitido === true);
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const tU = quoteSchemaTable(c.schema, "usuarios");
    const usuarioQ = await client.query<{ rol: string | null }>(
      `SELECT rol FROM ${tU} WHERE id = $1::uuid AND empresa_id = $2::uuid`,
      [id, c.empresaId]
    );
    if (usuarioQ.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Usuario no encontrado."), { status: 404 });
    }
    const porRol = permisosDeRol(usuarioQ.rows[0].rol);

    const tP = quoteSchemaTable(c.schema, "usuario_permisos");
    await client.query(`DELETE FROM ${tP} WHERE usuario_id = $1::uuid`, [id]);

    let guardados = 0;
    for (const accion of ACCIONES) {
      if (!pedidos.has(accion)) continue;
      const permitido = pedidos.get(accion)!;
      if (permitido === porRol.has(accion)) continue; // coincide con el rol: no es excepción
      await client.query(
        `INSERT INTO ${tP} (empresa_id, usuario_id, accion, permitido)
         VALUES ($1::uuid, $2::uuid, $3, $4)`,
        [c.empresaId, id, accion, permitido]
      );
      guardados += 1;
    }

    await client.query("COMMIT");
    return NextResponse.json(successResponse({ usuario_id: id, excepciones: guardados }));
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[permisos PUT]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron guardar los permisos."), { status: 500 });
  } finally {
    client?.release();
  }
}
