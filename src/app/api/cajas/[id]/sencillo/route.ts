import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/cajas/[id]/sencillo — el sencillo (cambio) que tiene el cajero
 * en el cajón. Body: { sencillo }. Solo con la caja abierta.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("Caja inválida."), { status: 400 });

    const body = (await request.json().catch(() => null)) as { sencillo?: unknown } | null;
    const sencillo = Number(body?.sencillo);
    if (!Number.isFinite(sencillo) || sencillo < 0) {
      return NextResponse.json(errorResponse("El sencillo tiene que ser un número mayor o igual a 0."), { status: 400 });
    }

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

    const col = await pool.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'cajas' AND column_name = 'sencillo'`,
      [schema]
    );
    if (col.rows.length === 0) {
      return NextResponse.json(
        errorResponse("Falta correr el SQL 48 (sencillo de la caja)."),
        { status: 409 }
      );
    }

    const q = await pool.query<{ estado: string }>(
      `UPDATE ${quoteSchemaTable(schema, "cajas")} SET sencillo = $1
        WHERE id = $2::uuid AND empresa_id = $3::uuid AND estado <> 'cerrada'
        RETURNING estado`,
      [Math.round(sencillo), id, empresaId]
    );
    if (q.rows.length === 0) {
      return NextResponse.json(errorResponse("La caja no existe o ya está cerrada."), { status: 409 });
    }
    return NextResponse.json(successResponse({ sencillo: Math.round(sencillo) }));
  } catch (err) {
    console.error("[/api/cajas/[id]/sencillo]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo guardar el sencillo."), { status: 500 });
  }
}
