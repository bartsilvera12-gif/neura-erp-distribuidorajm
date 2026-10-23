import { NextRequest } from "next/server";
import { conRrhh } from "@/lib/rrhh/server/rrhh-route";
import { crearFuncionario, listarFuncionarios } from "@/lib/rrhh/server/rrhh-pg";

/** GET /api/rrhh/funcionarios — todos los funcionarios (activos primero). */
export async function GET(request: NextRequest) {
  return conRrhh(request, "/api/rrhh/funcionarios", (schema, empresaId) => listarFuncionarios(schema, empresaId));
}

/** POST /api/rrhh/funcionarios — alta de funcionario. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return conRrhh(request, "/api/rrhh/funcionarios", async (schema, empresaId) => ({
    id: await crearFuncionario(schema, empresaId, body),
  }));
}
