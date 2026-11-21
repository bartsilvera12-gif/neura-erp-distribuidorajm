"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Printer } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { DesgloseDeVentas, VentasPorProducto } from "@/shared/caja/ArqueoProductos";
import TicketArqueo, { ANCHO_TICKET_MM } from "@/shared/caja/TicketArqueo";
import { useEmisor } from "@/shared/hooks/useEmisor";
import { totalConteo } from "@/lib/cajas/conteo";
import { totalesPlanilla, type DatosPlanilla, type PlanillaArqueo } from "@/lib/cajas/planilla";

type CajaItem = { id: string; numero_caja: number; estado: string; fecha_apertura: string };
type Planilla = { sistema: PlanillaArqueo; datos: DatosPlanilla };

const gs = (v: number) => `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
function fecha(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-PY", { timeZone: "America/Asuncion", day: "2-digit", month: "2-digit", year: "numeric" });
}

async function pedir<T>(url: string): Promise<T> {
  const res = await fetchWithSupabaseSession(url, { cache: "no-store" });
  const j = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!res.ok || !j.data) throw new Error(j.error ?? "No se pudo armar la rendición.");
  return j.data;
}

/**
 * Rendición del camión: la encargada elige el camión y el recorrido (caja) y el
 * sistema arma solo cuánto llevó, cuánto devolvió, cuánto vendió y cuánta plata
 * debe rendir el repartidor, con el desglose de ventas. Se imprime en ticket
 * térmico de 80 mm. Solo lectura: no mueve stock ni caja.
 */
export default function RendicionCamion({ camionId, alias }: { camionId: string; alias: string }) {
  const { emisor } = useEmisor();
  const { data: cajas, error: errCajas } = useSWR<{ cajas: CajaItem[] }>(["camion-rendicion", camionId], () =>
    pedir<{ cajas: CajaItem[] }>(`/api/camiones/${camionId}/rendicion`)
  );
  const [elegida, setElegida] = useState<string | null>(null);
  const cajaId = elegida ?? cajas?.cajas[0]?.id ?? null;
  const { data: p, error: errPlanilla } = useSWR<Planilla>(cajaId ? ["camion-rendicion-caja", cajaId] : null, () =>
    pedir<Planilla>(`/api/cajas/${cajaId}/planilla`)
  );

  const [ticket, setTicket] = useState(false);
  const [largoMm, setLargoMm] = useState(200);
  const refTicket = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ticket) return;
    const fin = () => setTicket(false);
    window.addEventListener("afterprint", fin);
    const alto = refTicket.current?.getBoundingClientRect().height ?? 0;
    if (alto > 0) setLargoMm(Math.max(60, Math.ceil(alto / (96 / 25.4)) + 6));
    const id = window.setTimeout(() => window.print(), 250);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("afterprint", fin);
    };
  }, [ticket]);

  if (errCajas) return <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{(errCajas as Error).message}</p>;
  if (!cajas) return <p className="py-6 text-sm text-slate-400">Armando la rendición…</p>;
  if (cajas.cajas.length === 0) {
    return (
      <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">
        {alias} todavía no tiene recorridos (cajas) del repartidor para rendir.
      </p>
    );
  }

  const s = p?.sistema;
  const d = p?.datos;
  const efectivo = d ? totalConteo(d.conteo) : 0;
  const t = d ? totalesPlanilla(d, efectivo) : null;
  const filas = s?.por_producto ?? [];
  const totalMercaderia = filas.reduce((a, f) => a + f.monto, 0);

  return (
    <div className="factura-imprimible">
      {ticket && s && t ? (
        <>
          <style>{`@media print { @page { size: ${ANCHO_TICKET_MM}mm ${largoMm}mm; margin: 0; } body { margin: 0 !important; } body * { visibility: hidden; } .ticket-rendicion, .ticket-rendicion * { visibility: visible; } .ticket-rendicion { position: absolute; left: 0; top: 0; } }`}</style>
          <div className="ticket-rendicion pointer-events-none fixed left-[-9999px] top-0 print:static print:left-0">
            <TicketArqueo
              ref={refTicket}
              s={s}
              t={{ debe: t.debe, rinde: t.rinde, diferencia: t.diferencia, efectivo }}
              titulo={emisor?.razon_social ?? emisor?.nombre_fantasia ?? "Distribuidora JM"}
              fecha={fecha(s.caja.fecha_apertura)}
            />
          </div>
        </>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Recorrido
          <select
            value={cajaId ?? ""}
            onChange={(e) => setElegida(e.target.value)}
            aria-label="Recorrido a rendir"
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm"
          >
            {cajas.cajas.map((c) => (
              <option key={c.id} value={c.id}>
                {fecha(c.fecha_apertura)} · Caja {c.numero_caja} ({c.estado})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!s}
          onClick={() => setTicket(true)}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          <Printer className="h-4 w-4" />
          Imprimir rendición
        </button>
      </div>

      {errPlanilla ? (
        <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{(errPlanilla as Error).message}</p>
      ) : !s || !t ? (
        <p className="py-6 text-sm text-slate-400">Armando la rendición…</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            {fecha(s.caja.fecha_apertura)}
            {s.responsable ? ` · ${s.responsable}` : ""} · Caja {s.caja.numero_caja}
          </p>
          <VentasPorProducto filas={filas} />
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="flex justify-between font-semibold text-slate-900">
              <span>Mercadería vendida</span>
              <span className="tabular-nums">{gs(totalMercaderia)}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-900">
              <span>Total que debe rendir</span>
              <span className="tabular-nums">{gs(t.debe)}</span>
            </div>
          </div>
          {s.desglose ? <DesgloseDeVentas d={s.desglose} /> : null}
        </div>
      )}
    </div>
  );
}
