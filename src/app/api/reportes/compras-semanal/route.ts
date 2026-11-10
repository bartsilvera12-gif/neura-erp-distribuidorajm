import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getComprasSemanal } from "@/lib/reportes/compras-semanal-pg";

export const runtime = "nodejs";

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/reportes/compras-semanal?mes=YYYY-MM — compras del mes por semana y por día. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const sp = request.nextUrl.searchParams;
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date()).slice(0, 7);
    const mes = MES.test(sp.get("mes") ?? "") ? sp.get("mes")! : hoy;
    const uuid = (k: string) => (UUID.test(sp.get(k) ?? "") ? sp.get(k)! : null);
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const data = await getComprasSemanal(schema, ctx.auth.empresa_id, {
      mes,
      proveedor_id: uuid("proveedor_id"),
      categoria_id: uuid("categoria_id"),
    });
    return NextResponse.json(successResponse(data));
  } catch (e) {
    console.error("[/api/reportes/compras-semanal]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo armar el reporte de compras por semana."), { status: 500 });
  }
}
