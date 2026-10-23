import "server-only";
import { NextResponse } from "next/server";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { requireRrhhModuleAccess } from "./rrhh-auth";
import { RrhhError, type TipoPago } from "./rrhh-pg";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function tipoDe(raw: string): TipoPago | null {
  return raw === "salario" || raw === "ips" ? raw : null;
}

/** Valida el acceso a RRHH, resuelve el schema y traduce los errores a respuesta. */
export async function conRrhh(
  request: Request,
  donde: string,
  fn: (schema: string, empresaId: string) => Promise<unknown>
): Promise<NextResponse> {
  try {
    const auth = await requireRrhhModuleAccess(request);
    if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });
    const schema = await fetchDataSchemaForEmpresaId(auth.empresaId);
    return NextResponse.json(successResponse(await fn(schema, auth.empresaId)));
  } catch (e) {
    if (e instanceof RrhhError) return NextResponse.json(errorResponse(e.message), { status: e.status });
    console.error(`[${donde}]`, e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo completar la operación."), { status: 500 });
  }
}
