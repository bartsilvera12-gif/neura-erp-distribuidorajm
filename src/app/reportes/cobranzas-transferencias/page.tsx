"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/fetch-with-supabase-session";
import { FechaSelect } from "@/components/ui/FechaSelect";
import { useEmisor } from "@/shared/hooks/useEmisor";

interface Fila {
  id: string;
  fecha: string | null;
  concepto: string | null;
  es_venta: boolean;
  monto: number;
}
interface Reporte {
  desde: string;
  hasta: string;
  disponible: boolean;
  resumen: { operaciones: number; total: number };
  filas: Fila[];
}

const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString("es-PY");
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function rangoHoy(): [string, string] {
  const h = ymd(new Date());
  return [h, h];
}
function rangoQuincena(): [string, string] {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  if (d.getDate() <= 15) return [`${y}-${pad(m + 1)}-01`, `${y}-${pad(m + 1)}-15`];
  const ultimo = new Date(y, m + 1, 0).getDate();
  return [`${y}-${pad(m + 1)}-16`, `${y}-${pad(m + 1)}-${pad(ultimo)}`];
}
function rangoMes(): [string, string] {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  const ultimo = new Date(y, m + 1, 0).getDate();
  return [`${y}-${pad(m + 1)}-01`, `${y}-${pad(m + 1)}-${pad(ultimo)}`];
}

export default function ReporteTransferenciasPage() {
  const [[d0, h0]] = useState(rangoMes);
  const [desde, setDesde] = useState(d0);
  const [hasta, setHasta] = useState(h0);
  const [imprimiendo, setImprimiendo] = useState(false);

  const { emisor } = useEmisor();
  const [data, setData] = useState<Reporte | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (desde) p.set("desde", desde);
    if (hasta) p.set("hasta", hasta);
    return p.toString();
  }, [desde, hasta]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/reportes/cobranzas-transferencias?${qs}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) {
        setError(j?.error ?? `Error ${r.status}`);
        setData(null);
        return;
      }
      setData(j.data as Reporte);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    load();
  }, [load]);

  const resumen = data?.resumen;
  const filas = data?.filas ?? [];

  if (imprimiendo && data) {
    return (
      <TicketTransferencias
        emisorNombre={emisor?.nombre_fantasia ?? emisor?.razon_social ?? "Distribuidora JM"}
        emisorRuc={emisor?.ruc ?? null}
        desde={desde}
        hasta={hasta}
        filas={filas}
        total={resumen?.total ?? 0}
        onVolver={() => setImprimiendo(false)}
      />
    );
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      <div>
        <nav className="mb-1 text-xs text-slate-500">
          <Link href="/reportes" className="hover:text-[#4FAEB2]">Reportes</Link> /{" "}
          <span className="font-semibold text-slate-700">Cobranzas por transferencia</span>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Cobranzas por transferencia</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cobranzas recibidas por transferencia bancaria en el período (incluye la porción
          transferencia de pagos mixtos). Imprimible en ticket para conciliar contra el extracto del
          banco. No incluye operaciones anuladas.
        </p>
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
        El banco, el titular y el nº de operación solo quedan registrados cuando se usa el módulo de{" "}
        <Link href="/cobranzas/conciliacion" className="font-semibold underline">Conciliación bancaria</Link>.
        Si no se usa, acá se listan fecha, concepto e importe de cada transferencia recibida.
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {([
            ["Hoy", rangoHoy],
            ["Quincena", rangoQuincena],
            ["Mes", rangoMes],
          ] as const).map(([label, fn]) => (
            <button
              key={label}
              onClick={() => { const r = fn(); setDesde(r[0]); setHasta(r[1]); }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91]"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="text-xs font-semibold text-slate-500">Desde
            <FechaSelect value={desde} onChange={(e) => setDesde(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-semibold text-slate-500">Hasta
            <FechaSelect value={hasta} onChange={(e) => setHasta(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
          </label>
          <div className="flex items-end">
            <button onClick={load} className="w-full rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91]">Aplicar</button>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => setImprimiendo(true)}
              disabled={!data || filas.length === 0}
              className="w-full rounded-lg border border-slate-800 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-40"
            >
              Imprimir ticket
            </button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {resumen && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Operaciones</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{resumen.operaciones.toLocaleString("es-PY")}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total recibido</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">Gs. {fmt(resumen.total)}</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[520px] text-xs">
          <thead className="border-b bg-slate-50 uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Fecha</th>
              <th className="px-3 py-2 text-left">Concepto</th>
              <th className="px-3 py-2 text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="px-3 py-8 text-center text-slate-400">Cargando…</td></tr>
            ) : filas.length === 0 ? (
              <tr><td colSpan={3} className="px-3 py-8 text-center text-slate-400">Sin transferencias en el período.</td></tr>
            ) : filas.map((f) => (
              <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50/60">
                <td className="px-3 py-1.5">{(f.fecha ?? "").slice(0, 10)}</td>
                <td className="px-3 py-1.5">{f.concepto ?? "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmt(f.monto)}</td>
              </tr>
            ))}
          </tbody>
          {resumen && filas.length > 0 && (
            <tfoot className="border-t bg-slate-50 font-semibold text-slate-800">
              <tr>
                <td className="px-3 py-2" colSpan={2}>TOTAL ({resumen.operaciones} operaciones)</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(resumen.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/** Ticket térmico 80 mm para conciliación bancaria (reusa el patrón de TicketVenta). */
function TicketTransferencias({
  emisorNombre,
  emisorRuc,
  desde,
  hasta,
  filas,
  total,
  onVolver,
}: {
  emisorNombre: string;
  emisorRuc: string | null;
  desde: string;
  hasta: string;
  filas: Fila[];
  total: number;
  onVolver: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [largoMm, setLargoMm] = useState(200);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setLargoMm(Math.ceil(el.offsetHeight / 3.7795) + 4);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [filas.length]);

  return (
    <div className="flex flex-col items-center gap-4 py-4 print:gap-0 print:py-0">
      <style>{`@media print { @page { size: 80mm ${largoMm}mm; margin: 0; } }`}</style>
      <article
        ref={ref}
        className="ticket-termico factura-imprimible bg-white font-mono text-black shadow-sm ring-1 ring-slate-200 print:shadow-none print:ring-0"
        style={{ width: "80mm", fontSize: "11.5px", lineHeight: 1.35 }}
      >
        <div style={{ padding: "1.5mm 3mm 3mm" }}>
          <div className="text-center">
            <p className="font-bold uppercase">{emisorNombre}</p>
            {emisorRuc ? <p>RUC: {emisorRuc}</p> : null}
            <p className="mt-2 font-bold">CONCILIACIÓN BANCARIA</p>
            <p>Transferencias recibidas</p>
            <p>Del {desde} al {hasta}</p>
          </div>

          <div className="my-1 border-t border-dashed border-black" />

          <ul className="space-y-1">
            {filas.map((f) => (
              <li key={f.id}>
                <div className="flex justify-between gap-2">
                  <span className="shrink-0">{(f.fecha ?? "").slice(0, 10)}</span>
                  <span className="shrink-0 tabular-nums">Gs. {fmt(f.monto)}</span>
                </div>
                <p className="truncate uppercase">{f.concepto ?? "—"}</p>
              </li>
            ))}
          </ul>

          <div className="my-1 border-t border-black" />
          <div className="flex justify-between gap-2 font-bold">
            <span>TOTAL ({filas.length})</span>
            <span className="tabular-nums">Gs. {fmt(total)}</span>
          </div>

          <div className="mt-2 text-center italic">
            <p>Conciliación de transferencias — uso interno.</p>
          </div>
        </div>
      </article>

      <div className="no-imprimir flex items-center gap-4">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg border border-slate-800 bg-white px-5 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          Imprimir
        </button>
        <button
          type="button"
          onClick={onVolver}
          className="font-mono text-sm text-slate-700 underline underline-offset-2"
        >
          Volver al reporte
        </button>
      </div>
    </div>
  );
}
