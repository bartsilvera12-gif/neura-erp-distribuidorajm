import { NextRequest } from "next/server";
import { conRendiciones, UUID_RE } from "@/lib/rendiciones/server/rendiciones-route";
import { getRendicion, RendicionError } from "@/lib/rendiciones/server/rendiciones-pg";

/** GET /api/rendiciones/[id] — la rendición con su detalle. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return conRendiciones(request, "/api/rendiciones/[id]", async ({ pool, schema, empresaId }) => {
    if (!UUID_RE.test(id)) throw new RendicionError("Rendición inválida.", 404);
    const r = await getRendicion(pool, schema, empresaId, id);
    if (!r) throw new RendicionError("La rendición no existe.", 404);
    return r;
  });
}
