import { NextRequest, NextResponse } from "next/server";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { requireContabilidadApiAccess } from "@/lib/contabilidad/contabilidad-auth";
import { contarExcluidas, listCuentasPorPagar, computeTotals, type CuentasPagarFilters } from "@/lib/reportes/cuentas-pagar-pg";

export const runtime = "nodejs";

function filtersFromUrl(url: URL): CuentasPagarFilters {
  const g = (k: string) => url.searchParams.get(k) || undefined;
  return { desde: g("desde"), hasta: g("hasta"), proveedor_id: g("proveedor_id"), estado: g("estado") };
}

/** GET /api/reportes/cuentas-por-pagar — deuda de compras a crédito (permiso contabilidad). */
export async function GET(request: NextRequest) {
  const auth = await requireContabilidadApiAccess(request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });
  try {
    const schema = await fetchDataSchemaForEmpresaId(auth.empresaId);
    const filtros = filtersFromUrl(new URL(request.url));
    const rows = await listCuentasPorPagar(schema, auth.empresaId, filtros);
    // Lo que no entra (contado, anuladas), para explicar la diferencia con Compras.
    const excluidas = await contarExcluidas(schema, auth.empresaId, filtros).catch(() => null);
    return NextResponse.json(successResponse({ rows, totals: computeTotals(rows), excluidas }));
  } catch (err) {
    console.error("[/api/reportes/cuentas-por-pagar GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo generar Cuentas por Pagar."), { status: 500 });
  }
}
