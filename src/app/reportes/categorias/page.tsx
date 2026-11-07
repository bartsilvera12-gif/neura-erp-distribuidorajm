"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/fetch-with-supabase-session";
import { FechaSelect } from "@/components/ui/FechaSelect";

interface Fila {
  categoria: string;
  ventas: number;
  compras: number;
}
interface Reporte {
  desde: string;
  hasta: string;
  disponible: boolean;
  resumen: { ventas_total: number; compras_total: number };
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

export default function ReporteCategoriasPage() {
  const [[d0, h0]] = useState(rangoMes);
  const [desde, setDesde] = useState(d0);
  const [hasta, setHasta] = useState(h0);

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
      const r = await apiFetch(`/api/reportes/categorias?${qs}`);
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

  function aplicarPreset(r: [string, string]) {
    setDesde(r[0]);
    setHasta(r[1]);
  }

  const resumen = data?.resumen;
  const filas = data?.filas ?? [];
  const maxVenta = Math.max(1, ...filas.map((f) => f.ventas));

  return (
    <div className="w-full min-w-0 space-y-5">
      <div>
        <nav className="mb-1 text-xs text-slate-500">
          <Link href="/reportes" className="hover:text-[#4FAEB2]">Reportes</Link> /{" "}
          <span className="font-semibold text-slate-700">Por categoría</span>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Ventas y Compras por categoría</h1>
        <p className="mt-1 text-sm text-slate-500">
          Importes de ventas y de compras agrupados por categoría de producto. Lo que no tiene
          categoría asignada figura como “Sin categoría”. No incluye operaciones anuladas.
        </p>
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
              onClick={() => aplicarPreset(fn())}
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
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {resumen && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ventas del período</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">Gs. {fmt(resumen.ventas_total)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Compras del período</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">Gs. {fmt(resumen.compras_total)}</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[520px] text-xs">
          <thead className="border-b bg-slate-50 uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Categoría</th>
              <th className="px-3 py-2 text-right">Ventas</th>
              <th className="px-3 py-2 text-right">Compras</th>
              <th className="px-3 py-2 text-left">Participación en ventas</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">Cargando…</td></tr>
            ) : filas.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">Sin datos en el período.</td></tr>
            ) : filas.map((f) => (
              <tr key={f.categoria} className="border-b last:border-0 hover:bg-slate-50/60">
                <td className="px-3 py-1.5 font-medium text-slate-800">{f.categoria}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt(f.ventas)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt(f.compras)}</td>
                <td className="px-3 py-1.5">
                  <div className="h-2 w-full rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-[#4FAEB2]" style={{ width: `${Math.round((f.ventas / maxVenta) * 100)}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {resumen && filas.length > 0 && (
            <tfoot className="border-t bg-slate-50 font-semibold text-slate-800">
              <tr>
                <td className="px-3 py-2">TOTAL</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(resumen.ventas_total)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(resumen.compras_total)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
