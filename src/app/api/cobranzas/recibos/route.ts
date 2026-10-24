import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { listarRecibos } from "@/lib/cobranzas/server/recibos-pg";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function hoy(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
}

/** GET /api/cobranzas/recibos?desde=&hasta=&q= — recibos de dinero emitidos. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });
    const sp = request.nextUrl.searchParams;
    const h = hoy();
    const desde = FECHA.test(sp.get("desde") ?? "") ? sp.get("desde")! : `${h.slice(0, 8)}01`;
    const hasta = FECHA.test(sp.get("hasta") ?? "") ? sp.get("hasta")! : h;
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const data = await listarRecibos(pool, schema, ctx.auth.empresa_id, {
      desde,
      hasta,
      q: sp.get("q"),
      conSaldo: sp.get("con_saldo") === "1",
    });
    return NextResponse.json(successResponse(data));
  } catch (e) {
    console.error("[/api/cobranzas/recibos]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudieron leer los recibos."), { status: 500 });
  }
}
