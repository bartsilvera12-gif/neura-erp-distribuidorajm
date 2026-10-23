import { NextRequest } from "next/server";
import { conRrhh, UUID_RE } from "@/lib/rrhh/server/rrhh-route";
import { actualizarFuncionario, RrhhError } from "@/lib/rrhh/server/rrhh-pg";

/** PATCH /api/rrhh/funcionarios/[id] — editar (también darlo de baja: estado inactivo). */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return conRrhh(request, "/api/rrhh/funcionarios/[id]", async (schema, empresaId) => {
    if (!UUID_RE.test(id)) throw new RrhhError("Funcionario inválido.");
    await actualizarFuncionario(schema, empresaId, id, body);
    return { ok: true };
  });
}
