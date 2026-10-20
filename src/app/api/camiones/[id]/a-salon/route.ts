import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { puede } from "@/lib/usuarios/server/permisos-pg";
import { CamionError, pasarAlSalon } from "@/lib/camiones/server/movimientos-camion";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/camiones/[id]/a-salon — bajar mercadería del camión al salón.
 * Body: { items: [{ producto_id, cantidad }] }
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("Camión inválido."), { status: 400 });

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    if (!(await puede({ schema, empresaId, email: ctx.auth.user.email }, "reparto.transferir"))) {
      return NextResponse.json(errorResponse("No tenés permiso para pasar mercadería al salón."), { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as { items?: unknown } | null;
    const raw = Array.isArray(body?.items) ? body!.items : [];
    const items = [];
    for (const r of raw as Record<string, unknown>[]) {
      const pid = String(r?.producto_id ?? "");
      const cantidad = Number(r?.cantidad);
      if (!UUID_RE.test(pid) || !Number.isFinite(cantidad) || cantidad < 0) {
        return NextResponse.json(errorResponse("Hay una cantidad inválida."), { status: 400 });
      }
      if (cantidad > 0) items.push({ producto_id: pid, cantidad });
    }
    if (items.length === 0) {
      return NextResponse.json(errorResponse("Poné cuánto pasar al salón."), { status: 400 });
    }

    const out = await pasarAlSalon({
      schema,
      empresaId,
      camionId: id,
      items,
      usuario: ctx.auth.user.email ?? null,
    });
    return NextResponse.json(successResponse(out));
  } catch (e) {
    if (e instanceof CamionError) return NextResponse.json(errorResponse(e.message), { status: e.status });
    console.error("[/api/camiones/[id]/a-salon]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudo pasar la mercadería al salón."), { status: 500 });
  }
}
