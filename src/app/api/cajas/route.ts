import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/** GET /api/cajas?estado=abierta — la caja abierta de la empresa, si hay. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

    // Sin tabla `cajas` el ERP no modela caja: se informa y la Caja decide.
    const existeQ = await queryWithRetry<{ existe: string | null }>(
      pool,
      `SELECT to_regclass($1)::text AS existe`,
      [`${schema}.cajas`]
    );
    if (existeQ.rows[0]?.existe === null) {
      return NextResponse.json(successResponse({ disponible: false, caja: null }));
    }

    const tC = quoteSchemaTable(schema, "cajas");
    const q = await queryWithRetry<{
      id: string;
      numero_caja: number;
      estado: string;
      fecha_apertura: string;
      monto_apertura: string;
    }>(
      pool,
      `SELECT id, numero_caja, estado, fecha_apertura::text AS fecha_apertura,
              monto_apertura::text AS monto_apertura
         FROM ${tC}
        WHERE empresa_id = $1::uuid AND estado = 'abierta'
        ORDER BY fecha_apertura DESC
        LIMIT 1`,
      [empresaId]
    );

    const row = q.rows[0];
    return NextResponse.json(
      successResponse({
        disponible: true,
        caja: row
          ? {
              id: row.id,
              numero_caja: Number(row.numero_caja),
              estado: "abierta" as const,
              fecha_apertura: row.fecha_apertura,
              monto_apertura: Number(row.monto_apertura),
            }
          : null,
      })
    );
  } catch (err) {
    console.error("[/api/cajas GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo consultar la caja."), { status: 500 });
  }
}
