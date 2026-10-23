import { NextRequest } from "next/server";
import { conRrhh, tipoDe, UUID_RE } from "@/lib/rrhh/server/rrhh-route";
import { crearPago, generarPeriodo, listarPagos, RrhhError } from "@/lib/rrhh/server/rrhh-pg";

/** GET /api/rrhh/pagos/salario|ips?periodo=AAAA-MM&estado=&funcionario_id= */
export async function GET(request: NextRequest, context: { params: Promise<{ tipo: string }> }) {
  const tipo = tipoDe((await context.params).tipo);
  const sp = request.nextUrl.searchParams;
  return conRrhh(request, "/api/rrhh/pagos", (schema, empresaId) => {
    if (!tipo) throw new RrhhError("Tipo de pago inválido.", 404);
    const funcionarioId = sp.get("funcionario_id");
    return listarPagos(schema, empresaId, tipo, {
      periodo: sp.get("periodo"),
      estado: sp.get("estado"),
      funcionarioId: funcionarioId && UUID_RE.test(funcionarioId) ? funcionarioId : null,
    });
  });
}

/**
 * POST /api/rrhh/pagos/salario|ips
 * `{ generar: true, periodo }` crea los pendientes del mes para todos los
 * activos; si no, carga un pago suelto.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ tipo: string }> }) {
  const tipo = tipoDe((await context.params).tipo);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return conRrhh(request, "/api/rrhh/pagos", async (schema, empresaId) => {
    if (!tipo) throw new RrhhError("Tipo de pago inválido.", 404);
    if (body.generar === true) return generarPeriodo(schema, empresaId, tipo, String(body.periodo ?? ""));
    if (!UUID_RE.test(String(body.funcionario_id ?? ""))) throw new RrhhError("Elegí el funcionario.");
    await crearPago(schema, empresaId, tipo, body);
    return { ok: true };
  });
}
