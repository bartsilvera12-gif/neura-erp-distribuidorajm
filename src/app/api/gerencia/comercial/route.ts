import { NextResponse } from "next/server";
import { resolveApiAuthContext } from "@/lib/middleware/api-auth-context";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { getReporteVentas } from "@/lib/gerencia/ventas-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/gerencia/comercial?period=YYYY-MM — venta por día, camión y producto.
 *
 * Solo lee. El schema sale de la empresa autenticada y no de la query: si
 * viniera del cliente, cualquiera podría leer los números de otra empresa.
 */
export async function GET(request: Request) {
  const r = await resolveApiAuthContext(request);
  if (!r.ok) {
    return NextResponse.json({ error: "No autorizado", code: r.code }, { status: 401 });
  }
  const empresaId = r.ctx.empresa_id;
  if (!empresaId) {
    return NextResponse.json({ error: "Usuario sin empresa" }, { status: 403 });
  }

  const url = new URL(request.url);
  const period = url.searchParams.get("period") || undefined;

  try {
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const reporte = await getReporteVentas(schema, empresaId, period);
    return NextResponse.json(reporte, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/gerencia/comercial]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error generando el reporte" }, { status: 500 });
  }
}
