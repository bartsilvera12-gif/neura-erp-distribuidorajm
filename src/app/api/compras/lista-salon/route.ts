import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { listaDelSalon } from "@/lib/camiones/server/camion-del-usuario";

/** GET /api/compras/lista-salon — con qué lista vende hoy el salón. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const lista = (await listaDelSalon({ schema, empresaId })) ?? "minorista";
    return NextResponse.json(successResponse({ lista }));
  } catch (err) {
    console.error("[/api/compras/lista-salon]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo leer la lista del salón."), { status: 500 });
  }
}
