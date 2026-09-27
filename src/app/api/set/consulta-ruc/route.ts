import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { separarRuc } from "@/lib/set/ruc";
import { consultarRucSet } from "@/lib/set/consulta-ruc";

export const runtime = "nodejs";

/**
 * GET /api/set/consulta-ruc?ruc=80012345-6
 *
 * Solo para usuarios logueados: la clave de la SET es de la empresa y tiene
 * cupo de consultas, así que no se ofrece a cualquiera.
 */
export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

  const rucDv = separarRuc(request.nextUrl.searchParams.get("ruc") ?? "");
  if (!rucDv) {
    return NextResponse.json(errorResponse("Escribí un RUC válido, por ejemplo 80012345-6."), {
      status: 400,
    });
  }

  const r = await consultarRucSet(rucDv);
  if (!r.ok) {
    return NextResponse.json(errorResponse(r.motivo), { status: 422 });
  }
  return NextResponse.json(successResponse({ ...r.datos, dv_calculado: rucDv.dvCalculado }));
}
