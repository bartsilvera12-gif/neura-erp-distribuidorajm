import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/repartos/repartidores — quién puede salir con un camión.
 *
 * Sale de la tabla `usuarios` DEL SCHEMA DEL CLIENTE y no del catálogo, porque
 * `repartos.repartidor_id` apunta a esa tabla: con un id del catálogo el alta
 * del reparto se rechaza con "ese repartidor no existe en esta empresa" aunque
 * la persona esté en pantalla.
 *
 * Devuelve a todos los usuarios activos, no solo a los de rol repartidor: en
 * una distribuidora chica el dueño también sale a repartir, y filtrar por rol
 * dejaría la lista vacía justo el día que falta alguien.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

    const existe = await queryWithRetry<{ t: string | null }>(
      pool,
      `SELECT to_regclass($1)::text AS t`,
      [`${schema}.usuarios`]
    );
    if (!existe.rows[0]?.t) {
      return NextResponse.json(successResponse({ repartidores: [] }));
    }

    // Las columnas varían entre schemas: se piden las que estén.
    const colsQ = await queryWithRetry<{ columna: string }>(
      pool,
      `SELECT column_name AS columna FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'usuarios'`,
      [schema]
    );
    const cols = new Set(colsQ.rows.map((r) => r.columna));
    const tU = quoteSchemaTable(schema, "usuarios");

    const nombre = cols.has("nombre") ? "nombre" : cols.has("nombre_completo") ? "nombre_completo" : null;
    const select = [
      "id",
      cols.has("email") ? "email" : "''::text AS email",
      nombre ? `${nombre} AS nombre` : "NULL::text AS nombre",
      cols.has("rol") ? "rol" : "NULL::text AS rol",
    ].join(", ");

    // Un usuario dado de baja no puede salir con el camión, pero si la tabla no
    // tiene `estado` no se inventa el filtro.
    const filtroEstado = cols.has("estado")
      ? " AND lower(COALESCE(estado, 'activo')) NOT IN ('inactivo', 'baja', 'suspendido')"
      : "";

    const q = await queryWithRetry<{
      id: string;
      email: string;
      nombre: string | null;
      rol: string | null;
    }>(
      pool,
      `SELECT ${select}
         FROM ${tU}
        WHERE empresa_id = $1::uuid${filtroEstado}
        ORDER BY ${nombre ? `${nombre} NULLS LAST, ` : ""}email`,
      [empresaId]
    );

    return NextResponse.json(successResponse({ repartidores: q.rows }));
  } catch (err) {
    console.error("[/api/repartos/repartidores GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      errorResponse("No se pudieron cargar los repartidores."),
      { status: 500 }
    );
  }
}
