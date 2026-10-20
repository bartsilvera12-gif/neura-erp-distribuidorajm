import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { prefijoComprobante } from "@/lib/compras/comprobantes";

/**
 * GET /api/compras/siguiente-numero?tipo=Remisión — el próximo número interno
 * para ese tipo de comprobante: REM-000001, REM-000002…  Sale del mayor ya
 * usado en las compras de la empresa, así que no se repite.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const tipo = request.nextUrl.searchParams.get("tipo") ?? "";
    const prefijo = prefijoComprobante(tipo);
    if (!prefijo) return NextResponse.json(errorResponse("Tipo de comprobante inválido."), { status: 400 });

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

    const q = await pool.query<{ n: string | null }>(
      `SELECT max(substring(numero_comprobante FROM $2)::bigint)::text AS n
         FROM ${quoteSchemaTable(schema, "compras")}
        WHERE empresa_id = $1::uuid AND numero_comprobante ~ $3`,
      [empresaId, `^${prefijo}-(\\d+)$`, `^${prefijo}-\\d+$`]
    );
    const siguiente = Number(q.rows[0]?.n ?? 0) + 1;
    return NextResponse.json(
      successResponse({ numero: `${prefijo}-${String(siguiente).padStart(6, "0")}` })
    );
  } catch (err) {
    console.error("[/api/compras/siguiente-numero]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo generar el número."), { status: 500 });
  }
}
