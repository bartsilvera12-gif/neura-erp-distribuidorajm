import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresa } from "@/lib/modulos/resolve-effective-modules";
import { ventasConDescuento } from "@/lib/ventas/server/descuentos-pg";

export const runtime = "nodejs";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/reportes/descuentos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD — las ventas
 * con descuento del período. Es de control: solo el administrador.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!esRolAdminEmpresa(ctx.auth.rol)) {
      return NextResponse.json(errorResponse("Este reporte es solo para el administrador."), { status: 403 });
    }
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión a la base."), { status: 503 });
    const sp = request.nextUrl.searchParams;
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
    const desde = FECHA.test(sp.get("desde") ?? "") ? sp.get("desde")! : `${hoy.slice(0, 8)}01`;
    const hasta = FECHA.test(sp.get("hasta") ?? "") ? sp.get("hasta")! : hoy;
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const descuentos = await ventasConDescuento(pool, schema, ctx.auth.empresa_id, { desde, hasta });
    return NextResponse.json(successResponse({ desde, hasta, descuentos }));
  } catch (e) {
    console.error("[/api/reportes/descuentos]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudieron leer los descuentos."), { status: 500 });
  }
}
