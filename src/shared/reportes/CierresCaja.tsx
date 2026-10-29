"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Lock } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import PlanillaArqueo from "@/shared/caja/PlanillaArqueo";
import type { CierreCaja } from "@/lib/reportes/cierres-caja";

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
const n = (v: number) => Math.round(v).toLocaleString("es-PY");
const gs = (v: number) => `Gs. ${n(v)}`;
function fechaHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-PY", {
    timeZone: "America/Asuncion",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
const INPUT =
  "h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/30";
const PLANILLA: Record<string, { texto: string; clase: string }> = {
  borrador: { texto: "Sin enviar", clase: "bg-slate-100 text-slate-600" },
  enviada: { texto: "Por revisar", clase: "bg-sky-50 text-sky-700" },
  revisada: { texto: "Revisada", clase: "bg-emerald-50 text-emerald-700" },
};

function Dif({ v }: { v: number | null }) {
  if (v === null) return <span className="text-slate-300">—</span>;
  if (Math.round(v) === 0) return <span className="font-semibold text-emerald-600">Cuadra</span>;
  return (
    <span className={`font-semibold ${v < 0 ? "text-red-600" : "text-amber-600"}`}>
      {v > 0 ? "+" : ""}
      {n(v)}
    </span>
  );
}

/**
 * Reportes → Cierres de caja: todas las cajas del período con su arqueo
 * (cobrado por medio, crédito, cobranzas, egresos, efectivo esperado contra
 * contado y diferencia) y cómo quedó su planilla. Tocando una se abre la
 * planilla completa.
 */
export default function CierresCaja() {
  const [desde, setDesde] = useState(`${hoy().slice(0, 8)}01`);
  const [hasta, setHasta] = useState(hoy());
  const [estado, setEstado] = useState<"" | "cerrada" | "abierta">("");
  const [q, setQ] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const qs = `desde=${desde}&hasta=${hasta}${estado ? `&estado=${estado}` : ""}`;
  const url = `/api/reportes/cierres-caja?${qs}`;
  const { data, error, isLoading, mutate } = useSWR<CierreCaja[]>(
    url,
    async () => {
      const res = await fetchWithSupabaseSession(url, { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { data?: { cierres: CierreCaja[] }; error?: string };
      if (!res.ok || !j.data) throw new Error(j.error ?? "No se pudo armar el reporte.");
      return j.data.cierres;
    },
    { revalidateOnFocus: true, keepPreviousData: true }
  );

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data ?? []).filter((c) => !t || (c.responsable ?? "").toLowerCase().includes(t) || String(c.numero_caja) === t);
  }, [data, q]);

  const tot = useMemo(() => {
    const s = (k: keyof CierreCaja) => lista.reduce((a, c) => a + (Number(c[k]) || 0), 0);
    const cerradas = lista.filter((c) => c.diferencia !== null);
    return {
      efectivo: s("efectivo"),
      transferencia: s("transferencia"),
      cheque: s("cheque"),
      credito: s("credito"),
      total_ventas: s("total_ventas"),
      cobranzas: s("cobranzas"),
      egresos: s("egresos"),
      esperado: s("esperado"),
      contado_cierre: cerradas.reduce((a, c) => a + (c.contado_cierre ?? 0), 0),
      diferencia: cerradas.reduce((a, c) => a + (c.diferencia ?? 0), 0),
      faltantes: cerradas.filter((c) => (c.diferencia ?? 0) < -0.5).length,
      cerradas: cerradas.length,
    };
  }, [lista]);

  const TH = "px-2.5 py-2.5 text-right";
  const TD = "px-2.5 py-2.5 text-right tabular-nums";

  return (
    <div className="space-y-5">
      <div>
        <Link href="/reportes" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Reportes
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          <Lock className="h-6 w-6 text-slate-400" />
          Cierres de caja
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          El arqueo de todas las cajas del período: lo cobrado por medio, el crédito, las cobranzas, los egresos y el
          efectivo esperado contra lo contado al cerrar. Tocá una caja para ver su planilla.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-slate-500">
          Desde
          <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value || desde)} className={`${INPUT} mt-1 block`} />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Hasta
          <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value || hasta)} className={`${INPUT} mt-1 block`} />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)} className={`${INPUT} mt-1 block`}>
            <option value="">Todas</option>
            <option value="cerrada">Cerradas</option>
            <option value="abierta">Abiertas</option>
          </select>
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar responsable o N° de caja…"
          className={`${INPUT} min-w-0 flex-1 basis-48`}
        />
        <ExportExcelButton url={`/api/reportes/cierres-caja/export?${qs}`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tarjeta titulo="Cajas" valor={String(lista.length)} pie={`${tot.cerradas} cerradas`} />
        <Tarjeta titulo="Total vendido" valor={gs(tot.total_ventas)} pie={`Crédito ${gs(tot.credito)}`} />
        <Tarjeta titulo="Cobrado" valor={gs(tot.efectivo + tot.transferencia + tot.cheque)}
          pie={`Efectivo ${gs(tot.efectivo)} · Transf. ${gs(tot.transferencia)}`} />
        <Tarjeta titulo="Cobranzas de crédito" valor={gs(tot.cobranzas)} pie={`Egresos ${gs(tot.egresos)}`} />
        <Tarjeta
          titulo="Diferencia (cerradas)"
          valor={Math.round(tot.diferencia) === 0 ? "Cuadra" : gs(tot.diferencia)}
          pie={tot.faltantes > 0 ? `${tot.faltantes} ${tot.faltantes === 1 ? "caja con faltante" : "cajas con faltante"}` : "Sin faltantes"}
          tono={tot.diferencia < -0.5 ? "rojo" : tot.diferencia > 0.5 ? "ambar" : "verde"}
        />
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{(error as Error).message}</p>
      ) : isLoading && !data ? (
        <p className="py-8 text-sm text-slate-400">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          No hay cajas en estas fechas.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 text-left">Caja</th>
                <th className={TH}>Efectivo</th>
                <th className={TH}>Transf.</th>
                <th className={TH}>Cheque</th>
                <th className={TH}>Crédito</th>
                <th className={TH}>Total vendido</th>
                <th className={TH}>Cobranzas</th>
                <th className={TH}>Egresos</th>
                <th className={TH}>Esperado</th>
                <th className={TH}>Contado</th>
                <th className={TH}>Diferencia</th>
                <th className="px-3 py-2.5 text-left">Planilla</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((c) => (
                <tr key={c.caja_id} onClick={() => setAbierta(c.caja_id)} className="cursor-pointer text-slate-800 hover:bg-slate-50">
                  <td className="px-3 py-2.5">
                    <span className="font-medium">
                      Caja {c.numero_caja} · {c.responsable ?? "—"}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {fechaHora(c.fecha_apertura)} → {c.estado === "abierta" ? <b className="text-emerald-600">abierta</b> : fechaHora(c.fecha_cierre)}
                    </span>
                  </td>
                  <td className={TD}>{n(c.efectivo)}</td>
                  <td className={TD}>{n(c.transferencia)}</td>
                  <td className={TD}>{n(c.cheque)}</td>
                  <td className={TD}>{n(c.credito)}</td>
                  <td className={`${TD} font-semibold`}>{n(c.total_ventas)}</td>
                  <td className={TD}>{n(c.cobranzas)}</td>
                  <td className={TD}>{n(c.egresos)}</td>
                  <td className={TD}>{n(c.esperado)}</td>
                  <td className={TD}>{c.contado_cierre === null ? <span className="text-slate-300">—</span> : n(c.contado_cierre)}</td>
                  <td className={TD}>
                    <Dif v={c.diferencia} />
                  </td>
                  <td className="px-3 py-2.5">
                    {c.planilla_estado ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PLANILLA[c.planilla_estado]?.clase ?? ""}`}>
                        {PLANILLA[c.planilla_estado]?.texto ?? c.planilla_estado}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Sin planilla</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <tr>
                <td className="px-3 py-2.5">Totales</td>
                <td className={TD}>{n(tot.efectivo)}</td>
                <td className={TD}>{n(tot.transferencia)}</td>
                <td className={TD}>{n(tot.cheque)}</td>
                <td className={TD}>{n(tot.credito)}</td>
                <td className={TD}>{n(tot.total_ventas)}</td>
                <td className={TD}>{n(tot.cobranzas)}</td>
                <td className={TD}>{n(tot.egresos)}</td>
                <td className={TD}>{n(tot.esperado)}</td>
                <td className={TD}>{n(tot.contado_cierre)}</td>
                <td className={TD}>
                  <Dif v={tot.cerradas > 0 ? tot.diferencia : null} />
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {abierta ? <PlanillaArqueo cajaId={abierta} onCerrar={() => setAbierta(null)} onGuardada={() => void mutate()} /> : null}
    </div>
  );
}

function Tarjeta({
  titulo,
  valor,
  pie,
  tono,
}: {
  titulo: string;
  valor: string;
  pie: string;
  tono?: "rojo" | "ambar" | "verde";
}) {
  const clase =
    tono === "rojo"
      ? "border-red-200 bg-red-50"
      : tono === "ambar"
        ? "border-amber-200 bg-amber-50"
        : tono === "verde"
          ? "border-emerald-200 bg-emerald-50"
          : "border-slate-200 bg-white";
  return (
    <div className={`rounded-2xl border p-4 ${clase}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{valor}</p>
      <p className="mt-0.5 truncate text-xs text-slate-500">{pie}</p>
    </div>
  );
}
