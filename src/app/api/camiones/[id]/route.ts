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
 * PATCH /api/camiones/[id] — da de baja, reactiva, o asigna el vendedor.
 * Body: { activo?: boolean, repartidor_id?: string | null }
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
    const cambiaActivo = typeof body?.activo === "boolean";
    const cambiaDueno = body != null && "repartidor_id" in body;
    if (!cambiaActivo && !cambiaDueno) {
      return NextResponse.json(errorResponse("No hay nada que cambiar."), { status: 400 });
    }
    const activo = cambiaActivo ? (body!.activo as boolean) : true;

    const tC = quoteSchemaTable(schema, "camiones");
    const tR = quoteSchemaTable(schema, "repartos");

    // Asignar el vendedor del camión: con esto su reparto se abre solo al
    // primer cobro, que es lo que evita las ventas huérfanas de camión.
    if (cambiaDueno) {
      const crudo = body!.repartidor_id;
      const repartidorId = crudo == null || crudo === "" ? null : String(crudo);
      if (repartidorId !== null && !UUID_RE.test(repartidorId)) {
        return NextResponse.json(errorResponse("Vendedor inválido."), { status: 400 });
      }
      const tieneCol = await queryWithRetry<{ c: string }>(
        pool,
        `SELECT column_name AS c FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'camiones' AND column_name = 'repartidor_id'`,
        [schema]
      );
      if (tieneCol.rows.length === 0) {
        return NextResponse.json(
          errorResponse("Falta correr 13_camion_del_vendedor.sql para poder asignar el camión."),
          { status: 409 }
        );
      }
      if (repartidorId !== null) {
        const existeU = await queryWithRetry<{ id: string }>(
          pool,
          `SELECT id FROM ${quoteSchemaTable(schema, "usuarios")}
            WHERE id = $1::uuid AND empresa_id = $2::uuid`,
          [repartidorId, empresaId]
        );
        if (existeU.rows.length === 0) {
          return NextResponse.json(errorResponse("Ese vendedor no existe en esta empresa."), {
            status: 400,
          });
        }
      }
      try {
        const updD = await queryWithRetry<{ id: string }>(
          pool,
          `UPDATE ${tC} SET repartidor_id = $3::uuid, updated_at = now()
            WHERE id = $1::uuid AND empresa_id = $2::uuid
            RETURNING id`,
          [id, empresaId, repartidorId]
        );
        if (updD.rows.length === 0) {
          return NextResponse.json(errorResponse("Camión no encontrado."), { status: 404 });
        }
      } catch (err) {
        // El índice único lo impide: un vendedor, un camión. Si tuviera dos,
        // abrir el reparto solo tendría que adivinar cuál.
        if ((err as { code?: string })?.code === "23505") {
          return NextResponse.json(
            errorResponse("Ese vendedor ya tiene otro camión asignado."),
            { status: 409 }
          );
        }
        throw err;
      }
      if (!cambiaActivo) {
        return NextResponse.json(successResponse({ camion_id: id, repartidor_id: repartidorId }));
      }
    }

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
