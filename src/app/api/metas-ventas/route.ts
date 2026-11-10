import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresa } from "@/lib/modulos/resolve-effective-modules";
import { borrarMeta, copiarMetas, guardarMeta, metasDelMes, MetaError } from "@/lib/metas/metas-ventas-pg";

export const runtime = "nodejs";

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function contexto(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuthWithRol(request);
  if (!ctx) return null;
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Pool no disponible.");
  const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
  return { ctx, pool, schema, esAdmin: esRolAdminEmpresa(ctx.auth.rol) };
}

function fallo(e: unknown, tag: string) {
  if (e instanceof MetaError) return NextResponse.json(errorResponse(e.message), { status: e.status });
  console.error(`[/api/metas-ventas ${tag}]`, e instanceof Error ? e.message : e);
  return NextResponse.json(errorResponse("No se pudo completar la operación con las metas."), { status: 500 });
}

/** GET /api/metas-ventas?mes=YYYY-MM — metas del mes con lo vendido y la lista de meses. */
export async function GET(request: NextRequest) {
  try {
    const c = await contexto(request);
    if (!c) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date()).slice(0, 7);
    const q = request.nextUrl.searchParams.get("mes") ?? "";
    const mes = MES.test(q) ? q : hoy;
    return NextResponse.json(successResponse(await metasDelMes(c.pool, c.schema, c.ctx.auth.empresa_id, mes, c.esAdmin)));
  } catch (e) {
    return fallo(e, "GET");
  }
}

/**
 * POST /api/metas-ventas — solo el administrador.
 *   { mes, clave, monto, nota }        crea o cambia una meta
 *   { accion: "copiar", desde, hasta } copia las metas de un mes a otro
 */
export async function POST(request: NextRequest) {
  try {
    const c = await contexto(request);
    if (!c) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!c.esAdmin) return NextResponse.json(errorResponse("Solo el administrador carga las metas."), { status: 403 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (b.accion === "copiar") {
      const desde = String(b.desde ?? ""), hasta = String(b.hasta ?? "");
      if (!MES.test(desde) || !MES.test(hasta)) throw new MetaError("Meses inválidos.");
      const n = await copiarMetas(c.pool, c.schema, c.ctx.auth.empresa_id, desde, hasta);
      return NextResponse.json(successResponse({ copiadas: n }));
    }
    const mes = String(b.mes ?? "");
    if (!MES.test(mes)) throw new MetaError("Elegí el mes.");
    await guardarMeta(c.pool, c.schema, c.ctx.auth.empresa_id, {
      mes,
      clave: String(b.clave ?? ""),
      monto: Number(b.monto),
      nota: typeof b.nota === "string" && b.nota.trim() ? b.nota.trim().slice(0, 300) : null,
      usuario: c.ctx.auth.user?.email ?? null,
    });
    return NextResponse.json(successResponse({ ok: true }));
  } catch (e) {
    return fallo(e, "POST");
  }
}

/** DELETE /api/metas-ventas?id=UUID — solo el administrador. */
export async function DELETE(request: NextRequest) {
  try {
    const c = await contexto(request);
    if (!c) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!c.esAdmin) return NextResponse.json(errorResponse("Solo el administrador borra metas."), { status: 403 });
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!UUID.test(id)) throw new MetaError("Meta inválida.");
    await borrarMeta(c.pool, c.schema, c.ctx.auth.empresa_id, id);
    return NextResponse.json(successResponse({ ok: true }));
  } catch (e) {
    return fallo(e, "DELETE");
  }
}
