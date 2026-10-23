import "server-only";
import { NextResponse } from "next/server";
import type { Pool } from "pg";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { RendicionError, type Responsable } from "./rendiciones-pg";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { pool: Pool; schema: string; empresaId: string; email: string | null };

/** Sesión, schema y pool; traduce los errores de rendición a respuesta. */
export async function conRendiciones(
  request: Request,
  donde: string,
  fn: (c: Ctx) => Promise<unknown>
): Promise<NextResponse> {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const data = await fn({ pool, schema, empresaId: ctx.auth.empresa_id, email: ctx.auth.user?.email ?? null });
    return NextResponse.json(successResponse(data));
  } catch (e) {
    if (e instanceof RendicionError) return NextResponse.json(errorResponse(e.message), { status: e.status });
    console.error(`[${donde}]`, e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo completar la operación."), { status: 500 });
  }
}

/** El responsable es un usuario del sistema de la misma empresa (los dueños de las cajas). */
export async function responsableDe(empresaId: string, id: string): Promise<Responsable> {
  if (!UUID_RE.test(id)) throw new RendicionError("Elegí quién rinde.");
  const { data } = await createServiceRoleClient()
    .from("usuarios")
    .select("id, nombre, email, empresa_id")
    .eq("id", id)
    .maybeSingle();
  const u = data as { id: string; nombre: string | null; email: string | null; empresa_id: string | null } | null;
  if (!u || u.empresa_id !== empresaId) throw new RendicionError("Ese usuario no es de la empresa.", 404);
  return { id: u.id, nombre: (u.nombre ?? u.email ?? "Sin nombre").toUpperCase(), email: u.email };
}
