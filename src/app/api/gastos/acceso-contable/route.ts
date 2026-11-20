import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { requireContabilidadApiAccess } from "@/lib/contabilidad/contabilidad-auth";

export const runtime = "nodejs";

/** GET /api/gastos/acceso-contable — indica si el usuario ve el formulario contable completo. */
export async function GET(request: NextRequest) {
  const auth = await requireContabilidadApiAccess(request);
  if (!auth.ok && auth.status === 401) return NextResponse.json(errorResponse(auth.message), { status: 401 });
  return NextResponse.json(successResponse({ contable: auth.ok }));
}
