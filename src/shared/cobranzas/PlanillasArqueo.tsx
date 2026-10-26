"use client";

import { useState } from "react";
import useSWR from "swr";
import { ClipboardList } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import PlanillaArqueo from "@/shared/caja/PlanillaArqueo";
import type { PlanillaResumen } from "@/lib/cajas/planilla";
import CobranzasTabs from "./CobranzasTabs";

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString("es-PY")}`;
const fecha = (f: string) => {
  const [a, m, d] = f.split("-");
  return `${d}/${m}/${a}`;
};
const INPUT =
  "h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/30";
const ESTADO: Record<string, { texto: string; clase: string }> = {
  borrador: { texto: "Sin enviar", clase: "bg-slate-100 text-slate-600" },
  enviada: { texto: "Por revisar", clase: "bg-sky-50 text-sky-700" },
  revisada: { texto: "Revisada", clase: "bg-emerald-50 text-emerald-700" },
};

/**
 * Cobranzas → Planillas de arqueo: las hojas de cierre que completan los
 * camioneros en el sistema. El administrador las abre, corrige si hace falta
 * y las marca revisadas.
 */
export default function PlanillasArqueo() {
  const [desde, setDesde] = useState(`${hoy().slice(0, 8)}01`);
  const [hasta, setHasta] = useState(hoy());
  const [abierta, setAbierta] = useState<string | null>(null);
  const url = `/api/planillas-arqueo?desde=${desde}&hasta=${hasta}`;
  type R = { disponible: boolean; planillas: PlanillaResumen[] };
  const { data, error, isLoading, mutate } = useSWR<R>(
    url,
    async () => {
      const res = await fetchWithSupabaseSession(url, { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { data?: R; error?: string };
      if (!res.ok || !j.data) throw new Error(j.error ?? "No se pudieron leer las planillas.");
      return j.data;
    },
    { revalidateOnFocus: true, keepPreviousData: true }
  );
  const lista = data?.planillas ?? [];
  const porRevisar = lista.filter((p) => p.estado === "enviada").length;
  const difTotal = lista.reduce((s, p) => s + p.diferencia, 0);

  return (
    <div className="space-y-5 px-4 pb-24 pt-4 sm:px-6 sm:pb-10">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          <ClipboardList className="h-6 w-6 text-slate-400" />
          Planillas de arqueo
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          La hoja de cierre de caja que completa cada camionero: composición de caja, crédito, cobranzas, gastos y
          transferencias, con lo que falta o sobra.
        </p>
      </div>

      <CobranzasTabs />

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-slate-500">
          Desde
          <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value || desde)} className={`${INPUT} mt-1 block`} />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Hasta
          <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value || hasta)} className={`${INPUT} mt-1 block`} />
        </label>
        <div className="ml-auto flex gap-2">
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2">
            <p className="text-[11px] font-semibold text-sky-700">Por revisar</p>
            <p className="text-base font-bold tabular-nums text-sky-900">{porRevisar}</p>
          </div>
          <div className={`rounded-xl border px-4 py-2 ${difTotal < 0 ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
            <p className={`text-[11px] font-semibold ${difTotal < 0 ? "text-red-700" : "text-emerald-700"}`}>Diferencia del período</p>
            <p className={`text-base font-bold tabular-nums ${difTotal < 0 ? "text-red-900" : "text-emerald-900"}`}>{gs(difTotal)}</p>
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{(error as Error).message}</p>
      ) : data && !data.disponible ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Falta correr el SQL 58 (planillas de arqueo).</p>
      ) : isLoading && !data ? (
        <p className="py-8 text-sm text-slate-400">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          No hay planillas en estas fechas. El camionero la completa desde Caja → Arqueo → «Planilla de arqueo».
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">Fecha</th>
                <th className="px-3 py-3">Responsable</th>
                <th className="px-3 py-3 text-right">Ventas</th>
                <th className="px-3 py-3 text-right">Crédito</th>
                <th className="px-3 py-3 text-right">Cobranzas</th>
                <th className="px-3 py-3 text-right">Gastos + transf.</th>
                <th className="px-3 py-3 text-right">Efectivo</th>
                <th className="px-3 py-3 text-right">Diferencia</th>
                <th className="px-3 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((p) => (
                <tr key={p.id} onClick={() => setAbierta(p.caja_id)} className="cursor-pointer text-slate-800 hover:bg-slate-50">
                  <td className="px-3 py-3 tabular-nums text-slate-500">{fecha(p.fecha)}</td>
                  <td className="px-3 py-3 font-medium">
                    {p.responsable ?? "—"}
                    <span className="block text-xs font-normal text-slate-400">
                      Caja {p.numero_caja ?? "—"}
                      {p.camion ? ` · Camión ${p.camion}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{gs(p.total_ventas)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{gs(p.total_credito)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{gs(p.total_cobranzas)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{gs(p.total_gastos + p.total_transferencias)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{gs(p.efectivo)}</td>
                  <td
                    className={`px-3 py-3 text-right font-semibold tabular-nums ${
                      Math.round(p.diferencia) === 0 ? "text-emerald-600" : p.diferencia < 0 ? "text-red-600" : "text-amber-600"
                    }`}
                  >
                    {Math.round(p.diferencia) === 0 ? "Cuadra" : gs(p.diferencia)}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO[p.estado].clase}`}>
                      {ESTADO[p.estado].texto}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abierta ? (
        <PlanillaArqueo cajaId={abierta} onCerrar={() => setAbierta(null)} onGuardada={() => void mutate()} />
      ) : null}
    </div>
  );
}
