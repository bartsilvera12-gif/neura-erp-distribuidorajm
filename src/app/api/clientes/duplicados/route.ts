import { NextRequest, NextResponse } from "next/server";
import { getClientesSupabaseFromAuthWithRol } from "@/lib/clientes/clientes-service-client";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresa } from "@/lib/modulos/resolve-effective-modules";
import { registrarHistorialCliente } from "@/lib/clientes/historial";
import { buscarGruposDuplicados, unificarClientes, UnificarError } from "@/lib/clientes/server/unificar-pg";

export const runtime = "nodejs";

async function contexto(request: NextRequest) {
  const ctx = await getClientesSupabaseFromAuthWithRol(request);
  if (!ctx) return { error: NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 }) };
  if (!esRolAdminEmpresa(ctx.auth.rol)) {
    return { error: NextResponse.json(errorResponse("Solo el administrador unifica clientes."), { status: 403 }) };
  }
  const pool = getChatPostgresPool();
  if (!pool) return { error: NextResponse.json(errorResponse("Sin conexión a la base."), { status: 503 }) };
  const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
  return { ctx, pool, schema };
}

/** GET /api/clientes/duplicados — grupos de clientes que parecen el mismo (por cédula/RUC o nombre). */
export async function GET(request: NextRequest) {
  try {
    const c = await contexto(request);
    if ("error" in c) return c.error;
    return NextResponse.json(successResponse({ grupos: await buscarGruposDuplicados(c.pool, c.schema, c.ctx.auth.empresa_id) }));
  } catch (e) {
    console.error("[/api/clientes/duplicados GET]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudieron buscar los duplicados."), { status: 500 });
  }
}

/**
 * POST /api/clientes/duplicados { conservar, duplicados: [] } — pasa ventas,
 * facturas, recibos y todo lo demás de los duplicados al cliente que queda, y
 * da de baja los duplicados.
 */
export async function POST(request: NextRequest) {
  try {
    const c = await contexto(request);
    if ("error" in c) return c.error;
    const b = (await request.json().catch(() => ({}))) as { conservar?: unknown; duplicados?: unknown };
    const dups = Array.isArray(b.duplicados) ? b.duplicados.map(String) : [];
    const r = await unificarClientes(c.pool, c.schema, c.ctx.auth.empresa_id, String(b.conservar ?? ""), dups);
    await registrarHistorialCliente(c.ctx.supabase, {
      empresaId: c.ctx.auth.empresa_id,
      clienteId: String(b.conservar),
      accion: "update",
      detalle: { unificado_con: r.unificados, movidos: r.movidos },
      authUserId: c.ctx.auth.user?.id ?? null,
      email: typeof c.ctx.auth.user?.email === "string" ? c.ctx.auth.user.email : null,
      source: "clientes_ui",
    });
    return NextResponse.json(successResponse(r));
  } catch (e) {
    if (e instanceof UnificarError) return NextResponse.json(errorResponse(e.message), { status: 400 });
    console.error("[/api/clientes/duplicados POST]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudieron unificar los clientes."), { status: 500 });
  }
}
