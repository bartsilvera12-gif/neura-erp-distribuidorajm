import { NextRequest } from "next/server";
import { conRendiciones, responsableDe } from "@/lib/rendiciones/server/rendiciones-route";
import { calcularRendicion, RendicionError, ultimaRendicion } from "@/lib/rendiciones/server/rendiciones-pg";

/** Comienzo del día de hoy en Paraguay. */
function inicioDeHoy(): string {
  const h = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
  return `${h}T00:00:00-03:00`;
}

/**
 * GET /api/rendiciones/calcular?responsable_id=&desde=&hasta=
 * Lo que cobró esa persona en el período. Sin `desde`, arranca donde terminó
 * su última rendición (o hoy a la mañana); sin `hasta`, ahora.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  return conRendiciones(request, "/api/rendiciones/calcular", async ({ pool, schema, empresaId }) => {
    const responsable = await responsableDe(empresaId, sp.get("responsable_id") ?? "");
    const ultima = await ultimaRendicion(pool, schema, empresaId, responsable.id);
    const desde = sp.get("desde") || ultima || inicioDeHoy();
    const hasta = sp.get("hasta") || new Date().toISOString();
    if (Number.isNaN(Date.parse(desde)) || Number.isNaN(Date.parse(hasta))) throw new RendicionError("Período inválido.");
    const calc = await calcularRendicion(pool, schema, empresaId, responsable, desde, hasta);
    return { ...calc, ultima_rendicion: ultima };
  });
}
