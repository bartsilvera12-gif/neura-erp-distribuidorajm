import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { CamionError } from "@/lib/camiones/server/movimientos-camion";
import { inventarioCamion } from "@/lib/camiones/server/inventario-camion";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hoyAsuncion(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
}

/**
 * GET /api/camiones/[id]/inventario?desde=AAAA-MM-DD
 * Por producto: código, descripción, precio de venta (lista del camión),
 * saldo inicial, cargada, vendida, otros movimientos y saldo; y el listado de
 * cargas y transferencias del período.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("Camión inválido."), { status: 400 });
    const desde = request.nextUrl.searchParams.get("desde") || hoyAsuncion();
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const data = await inventarioCamion({ schema, empresaId: ctx.auth.empresa_id, camionId: id, desde });
    return NextResponse.json(successResponse(data));
  } catch (e) {
    if (e instanceof CamionError) return NextResponse.json(errorResponse(e.message), { status: e.status });
    console.error("[/api/camiones/[id]/inventario]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo leer el inventario del camión."), { status: 500 });
  }
}
