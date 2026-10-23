"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Printer, ReceiptText, Search } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { METODOS_COBRO } from "@/lib/ventas/types";
import ReciboCobro, { type DatosReciboCobro } from "@/shared/caja/ReciboCobro";
import CobranzasTabs from "./CobranzasTabs";

type Recibo = {
  id: string;
  numero: number;
  fecha: string;
  cliente_nombre: string;
  cliente_ruc: string | null;
  monto: number;
  medio_pago: string | null;
  concepto: string | null;
  venta_numero: string | null;
  saldo_restante: number | null;
  usuario_nombre: string | null;
  anulado: boolean;
};

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString("es-PY")}`;
const numero = (n: number) => `REC-${String(n).padStart(6, "0")}`;
const medioLabel = (v: string | null) => METODOS_COBRO.find((m) => m.value === v)?.label ?? v ?? "—";

function fechaHora(iso: string): string {
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

/**
 * Cobranzas → Recibos de dinero (punto 3): todos los recibos emitidos por los
 * cobros a clientes, numerados, con búsqueda por cliente / número / venta y
 * reimpresión.
 */
export default function RecibosDinero() {
  const [desde, setDesde] = useState(`${hoy().slice(0, 8)}01`);
  const [hasta, setHasta] = useState(hoy());
  const [q, setQ] = useState("");
  const [imprimir, setImprimir] = useState<DatosReciboCobro | null>(null);

  const url = `/api/cobranzas/recibos?desde=${desde}&hasta=${hasta}`;
  const { data, error, isLoading } = useSWR<{ disponible: boolean; recibos: Recibo[] }>(
    url,
    async () => {
      const res = await fetchWithSupabaseSession(url);
      const j = (await res.json().catch(() => ({}))) as { data?: { disponible: boolean; recibos: Recibo[] }; error?: string };
      if (!res.ok || !j.data) throw new Error(j.error ?? "No se pudieron leer los recibos.");
      return j.data;
    },
    { revalidateOnFocus: true, keepPreviousData: true }
  );

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.recibos ?? []).filter(
      (r) =>
        !t ||
        r.cliente_nombre.toLowerCase().includes(t) ||
        numero(r.numero).toLowerCase().includes(t) ||
        String(r.numero) === t.replace(/\D/g, "") ||
        (r.venta_numero ?? "").toLowerCase().includes(t) ||
        (r.cliente_ruc ?? "").includes(t)
    );
  }, [data, q]);
  const total = lista.filter((r) => !r.anulado).reduce((s, r) => s + r.monto, 0);

  function reimprimir(r: Recibo) {
    setImprimir({
      cliente: r.cliente_nombre,
      clienteRuc: r.cliente_ruc,
      ventaNumero: r.venta_numero ?? "",
      monto: r.monto,
      saldo: r.saldo_restante,
      medioPago: r.medio_pago ?? "efectivo",
      fecha: r.fecha,
      reciboNumero: numero(r.numero),
    });
  }

  return (
    <div className="space-y-5 px-4 pb-24 pt-4 sm:px-6 sm:pb-10">
      <div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
          />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Operativo</p>
        </div>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          <ReceiptText className="h-6 w-6 text-slate-400" />
          Recibos de dinero
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Cada cobro a un cliente emite un recibo numerado. Acá quedan todos, para controlar y reimprimir.
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
        <div className="relative min-w-0 flex-1 basis-60">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por cliente, N° de recibo o de venta…"
            className={`${INPUT} w-full pl-9`}
          />
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2">
          <p className="text-[11px] font-semibold text-emerald-700">{lista.length} recibos</p>
          <p className="text-base font-bold tabular-nums text-emerald-900">{gs(total)}</p>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{(error as Error).message}</p>
      ) : data && !data.disponible ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Falta correr el SQL 53 (recibos de dinero). Mientras tanto el recibo se imprime al cobrar, pero no queda numerado acá.
        </p>
      ) : isLoading && !data ? (
        <p className="py-8 text-sm text-slate-400">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          No hay recibos en estas fechas.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full whitespace-nowrap text-sm [&_td]:px-3 [&_th]:px-3">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">N° recibo</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Concepto</th>
                <th className="px-4 py-3">Forma de pago</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3">Cobró</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((r) => (
                <tr key={r.id} className={r.anulado ? "text-slate-400 line-through" : "text-slate-800"}>
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{numero(r.numero)}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-500">{fechaHora(r.fecha)}</td>
                  <td className="px-4 py-3 font-medium">
                    {r.cliente_nombre}
                    {r.cliente_ruc ? <span className="block text-xs font-normal text-slate-400">{r.cliente_ruc}</span> : null}
                  </td>
                  <td className="max-w-48 truncate px-4 py-3 text-slate-600" title={r.concepto ?? ""}>
                    {r.venta_numero ? `Venta ${r.venta_numero}` : (r.concepto ?? "—")}
                  </td>
                  <td className="px-4 py-3">{medioLabel(r.medio_pago)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{gs(r.monto)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{r.usuario_nombre ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {r.anulado ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 no-underline">Anulado</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => reimprimir(r)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Reimprimir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {imprimir ? <ReciboCobro datos={imprimir} onCerrar={() => setImprimir(null)} /> : null}
    </div>
  );
}
