import { NextRequest } from "next/server";
import { conRrhh, tipoDe, UUID_RE } from "@/lib/rrhh/server/rrhh-route";
import { actualizarPago, eliminarPago, RrhhError } from "@/lib/rrhh/server/rrhh-pg";

type Ctx = { params: Promise<{ tipo: string; id: string }> };

/** PATCH — editar importe, fechas, estado u observaciones. */
export async function PATCH(request: NextRequest, context: Ctx) {
  const { tipo: t, id } = await context.params;
  const tipo = tipoDe(t);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return conRrhh(request, "/api/rrhh/pagos/[id]", async (schema, empresaId) => {
    if (!tipo || !UUID_RE.test(id)) throw new RrhhError("Pago inválido.", 404);
    await actualizarPago(schema, empresaId, tipo, id, body);
    return { ok: true };
  });
}

/** DELETE — solo pagos pendientes. */
export async function DELETE(request: NextRequest, context: Ctx) {
  const { tipo: t, id } = await context.params;
  const tipo = tipoDe(t);
  return conRrhh(request, "/api/rrhh/pagos/[id]", async (schema, empresaId) => {
    if (!tipo || !UUID_RE.test(id)) throw new RrhhError("Pago inválido.", 404);
    await eliminarPago(schema, empresaId, tipo, id);
    return { ok: true };
  });
}
