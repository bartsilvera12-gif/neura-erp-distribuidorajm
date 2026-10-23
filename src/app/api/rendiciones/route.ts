import { NextRequest } from "next/server";
import { conRendiciones, responsableDe } from "@/lib/rendiciones/server/rendiciones-route";
import { listarRendiciones, registrarRendicion, RendicionError } from "@/lib/rendiciones/server/rendiciones-pg";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());

/** GET /api/rendiciones?desde=&hasta= — rendiciones registradas en esas fechas. */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const h = hoy();
  const desde = FECHA.test(sp.get("desde") ?? "") ? sp.get("desde")! : `${h.slice(0, 8)}01`;
  const hasta = FECHA.test(sp.get("hasta") ?? "") ? sp.get("hasta")! : h;
  return conRendiciones(request, "/api/rendiciones GET", ({ pool, schema, empresaId }) =>
    listarRendiciones(pool, schema, empresaId, { desde, hasta })
  );
}

/**
 * POST /api/rendiciones — registra una rendición.
 * Body: { responsable_id, desde, hasta, rendido: { efectivo: 0, transferencia: 0, … }, observaciones }
 * Lo cobrado se recalcula en el servidor.
 */
export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return conRendiciones(request, "/api/rendiciones POST", async ({ pool, schema, empresaId, email }) => {
    const desde = String(b.desde ?? "");
    const hasta = String(b.hasta ?? "");
    if (Number.isNaN(Date.parse(desde)) || Number.isNaN(Date.parse(hasta))) throw new RendicionError("Período inválido.");
    const rendido: Record<string, number> = {};
    for (const [k, v] of Object.entries((b.rendido ?? {}) as Record<string, unknown>)) {
      if (/^[a-z_]{1,30}$/.test(k) && Number.isFinite(Number(v))) rendido[k] = Number(v);
    }
    const responsable = await responsableDe(empresaId, String(b.responsable_id ?? ""));
    return registrarRendicion(pool, schema, empresaId, responsable, {
      desde,
      hasta,
      rendido,
      observaciones: String(b.observaciones ?? "").trim() || null,
      recibidoPor: email,
    });
  });
}
