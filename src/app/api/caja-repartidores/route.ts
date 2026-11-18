import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { puede } from "@/lib/usuarios/server/permisos-pg";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lista editable de repartidores que rinden efectivo en la caja
 * (tabla caja_repartidores). GET lista, POST agrega, PATCH renombra o activa/desactiva.
 */
async function contexto(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return null;
  const empresaId = ctx.auth.empresa_id;
  const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
  return { empresaId, schema, email: ctx.auth.user.email };
}

export async function GET(request: NextRequest) {
  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });
  try {
    const c = await contexto(request);
    if (!c) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const incluirInactivos = request.nextUrl.searchParams.get("todos") === "1";
    const r = await pool.query(
      `SELECT id, nombre, activo, orden FROM ${quoteSchemaTable(c.schema, "caja_repartidores")}
        WHERE empresa_id = $1::uuid ${incluirInactivos ? "" : "AND activo"}
        ORDER BY orden, nombre`,
      [c.empresaId]
    );
    return NextResponse.json(successResponse({ repartidores: r.rows }));
  } catch (err) {
    console.error("[/api/caja-repartidores GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo leer la lista de repartidores."), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });
  try {
    const c = await contexto(request);
    if (!c) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!(await puede({ schema: c.schema, empresaId: c.empresaId, email: c.email }, "caja.movimiento"))) {
      return NextResponse.json(errorResponse("No tenés permiso para editar la lista de repartidores."), { status: 403 });
    }
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre) return NextResponse.json(errorResponse("Poné el nombre del repartidor."), { status: 400 });
    const t = quoteSchemaTable(c.schema, "caja_repartidores");
    const ya = await pool.query(
      `SELECT id FROM ${t} WHERE empresa_id = $1::uuid AND lower(nombre) = lower($2)`,
      [c.empresaId, nombre]
    );
    if (ya.rows.length > 0) {
      await pool.query(`UPDATE ${t} SET activo = true WHERE id = $1::uuid`, [ya.rows[0].id]);
      return NextResponse.json(successResponse({ id: ya.rows[0].id, nombre }));
    }
    const r = await pool.query<{ id: string }>(
      `INSERT INTO ${t} (empresa_id, nombre, orden)
       VALUES ($1::uuid, $2, COALESCE((SELECT max(orden) FROM ${t} WHERE empresa_id = $1::uuid), 0) + 1)
       RETURNING id`,
      [c.empresaId, nombre]
    );
    return NextResponse.json(successResponse({ id: r.rows[0].id, nombre }));
  } catch (err) {
    console.error("[/api/caja-repartidores POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo agregar el repartidor."), { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });
  try {
    const c = await contexto(request);
    if (!c) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!(await puede({ schema: c.schema, empresaId: c.empresaId, email: c.email }, "caja.movimiento"))) {
      return NextResponse.json(errorResponse("No tenés permiso para editar la lista de repartidores."), { status: 403 });
    }
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const id = typeof body?.id === "string" ? body.id : "";
    if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("Repartidor inválido."), { status: 400 });
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : null;
    const activo = typeof body?.activo === "boolean" ? body.activo : null;
    await pool.query(
      `UPDATE ${quoteSchemaTable(c.schema, "caja_repartidores")}
          SET nombre = COALESCE(NULLIF($3, ''), nombre), activo = COALESCE($4::boolean, activo)
        WHERE id = $1::uuid AND empresa_id = $2::uuid`,
      [id, c.empresaId, nombre, activo]
    );
    return NextResponse.json(successResponse({ id }));
  } catch (err) {
    console.error("[/api/caja-repartidores PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo actualizar el repartidor."), { status: 500 });
  }
}
