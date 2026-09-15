import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { puede } from "@/lib/usuarios/server/permisos-pg";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/camiones/[id] — da de baja o reactiva un camión.
 * Body: { activo: boolean }
 *
 * Baja lógica y no DELETE: los repartos viejos apuntan al camión y borrarlo
 * dejaría el histórico sin poder decir de qué camión salieron.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const { id } = await context.params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json(errorResponse("Camión inválido."), { status: 400 });
    }

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));

    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

    if (!(await puede({ schema, empresaId, email: ctx.auth.user.email }, "camion.administrar"))) {
      return NextResponse.json(errorResponse("No tenés permiso para administrar camiones."), {
        status: 403,
      });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (typeof body?.activo !== "boolean") {
      return NextResponse.json(errorResponse("Indicá si el camión queda activo o de baja."), {
        status: 400,
      });
    }
    const activo = body.activo;

    const tC = quoteSchemaTable(schema, "camiones");
    const tR = quoteSchemaTable(schema, "repartos");

    // Dar de baja un camión que está en la calle dejaría el reparto sin poder
    // cerrarse desde la pantalla, porque el alta filtra por activo.
    if (!activo) {
      const enCalle = await queryWithRetry<{ id: string }>(
        pool,
        `SELECT r.id FROM ${tR} r
          WHERE r.empresa_id = $1::uuid AND r.camion_id = $2::uuid AND r.estado = 'abierto'
          LIMIT 1`,
        [empresaId, id]
      );
      if (enCalle.rows.length > 0) {
        return NextResponse.json(
          errorResponse("Ese camión tiene un reparto abierto. Cerralo antes de darlo de baja."),
          { status: 409 }
        );
      }
    }

    const upd = await queryWithRetry<{ id: string }>(
      pool,
      `UPDATE ${tC} SET activo = $3, updated_at = now()
        WHERE id = $1::uuid AND empresa_id = $2::uuid
        RETURNING id`,
      [id, empresaId, activo]
    );
    if (upd.rows.length === 0) {
      return NextResponse.json(errorResponse("Camión no encontrado."), { status: 404 });
    }

    return NextResponse.json(successResponse({ camion_id: id, activo }));
  } catch (err) {
    console.error("[/api/camiones/[id] PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo actualizar el camión."), { status: 500 });
  }
}
