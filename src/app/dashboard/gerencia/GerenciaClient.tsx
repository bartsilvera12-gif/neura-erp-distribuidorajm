"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { ReporteVentas } from "@/lib/gerencia/ventas-data";
import { gs, gsShort, pct, pctColor } from "@/lib/report/format";
import { Kpi } from "@/components/ui/report";

const TEAL = "#4FAEB2";

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "16/09" para el eje del gráfico, sin depender del huso del navegador. */
function diaCorto(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

function diaLargo(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-PY", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

/** Cantidad sin decimales de más: 9.4 KG pero 12 unidades. */
function cant(n: number, unidad: string): string {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
  return unidad ? `${s} ${unidad}` : s;
}

async function fetchReporte(period: string): Promise<ReporteVentas> {
  const res = await fetchWithSupabaseSession(`/api/gerencia/comercial?period=${period}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

/** Barra de participación dentro de una fila de tabla. */
function Participacion({ valor }: { valor: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(2, Math.round(valor * 100))}%`, backgroundColor: TEAL }}
        />
      </div>
      <span className="tabular-nums text-xs text-slate-500">
        {(valor * 100).toFixed(1)}%
      </span>
    </div>
  );
}

/**
 * Gerencia de la distribuidora: cuánto se vendió, qué día, de qué camión y de
 * qué producto.
 *
 * Son las tres preguntas que se hace quien mira el mes cerrado: si el mes viene
 * mejor o peor que el anterior, qué camión está tirando del carro, y qué
 * producto sostiene la facturación.
 */
export default function GerenciaClient() {
  const [period, setPeriod] = useState(thisMonth());
  const [data, setData] = useState<ReporteVentas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verTodosProductos, setVerTodosProductos] = useState(false);

  const load = useCallback(async (p: string) => {
    setCargando(true);
    setError(null);
    try {
      setData(await fetchReporte(p));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [period, load]);

  const periodOptions = useMemo(() => {
    const opts: string[] = [];
    const d = new Date();
    for (let i = 0; i < 12; i++) {
      opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      d.setMonth(d.getMonth() - 1);
    }
    return opts;
  }, []);

  const productosVisibles = useMemo(() => {
    const todos = data?.por_producto ?? [];
    return verTodosProductos ? todos : todos.slice(0, 10);
  }, [data, verTodosProductos]);

  const r = data?.resumen;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Gerencia</h1>
          <p className="mt-1 text-sm text-slate-500">
            Venta por día, por camión y por producto.
          </p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          aria-label="Mes del reporte"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
        >
          {periodOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
          No se pudo cargar: {error}
        </div>
      ) : null}

      {cargando && !data ? (
        <p className="py-16 text-center text-sm text-slate-400">Cargando…</p>
      ) : data && !data.disponible ? (
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          Este schema todavía no tiene la tabla de ventas, así que no hay nada que resumir.
        </div>
      ) : data && r ? (
        <>
          {/* ── Resumen del mes ── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Venta del mes"
              value={gs(r.total)}
              sub={
                r.variacion_pct == null
                  ? "Sin mes anterior para comparar"
                  : `${pct(r.variacion_pct)} vs ${gs(r.total_mes_anterior)}`
              }
              subColor={r.variacion_pct == null ? undefined : pctColor(r.variacion_pct)}
              accent
            />
            <Kpi
              label="Ventas"
              value={String(r.ventas)}
              sub={r.ventas === 1 ? "orden registrada" : "órdenes registradas"}
            />
            <Kpi
              label="Ticket promedio"
              value={r.ventas > 0 ? gs(r.ticket_promedio) : "—"}
              sub="Por orden de venta"
            />
            <Kpi
              label="Promedio por día"
              value={r.dias_con_venta > 0 ? gs(r.promedio_diario) : "—"}
              sub={`Sobre ${r.dias_con_venta} ${r.dias_con_venta === 1 ? "día con venta" : "días con venta"}`}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Cobrado al contado" value={gs(r.contado)} />
            <Kpi
              label="Vendido a crédito"
              value={gs(r.credito)}
              sub={r.credito > 0 ? "Todavía por cobrar" : "Nada fiado este mes"}
            />
            <Kpi
              label="Mejor día"
              value={r.mejor_dia ? gs(r.mejor_dia.total) : "—"}
              sub={r.mejor_dia ? diaLargo(r.mejor_dia.dia) : "Sin ventas en el mes"}
            />
          </div>

          {/* ── Venta por día ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Venta por día</h2>
            {data.por_dia.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">
                No hubo ventas en este mes.
              </p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.por_dia} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="dia"
                      tickFormatter={diaCorto}
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tickFormatter={gsShort}
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      tickLine={false}
                      axisLine={false}
                      width={64}
                    />
                    <Tooltip
                      formatter={(v: number) => [gs(v), "Vendido"]}
                      labelFormatter={(d: string) => diaLargo(d)}
                      contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e2e8f0" }}
                    />
                    <Bar dataKey="total" fill={TEAL} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* ── Venta por camión ── */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Venta por camión</h2>
              {data.por_camion.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  Todavía no hay ventas asociadas a un reparto.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                        <th className="pb-2 font-medium">Camión</th>
                        <th className="pb-2 font-medium">Ventas</th>
                        <th className="pb-2 pr-6 text-right font-medium">Vendido</th>
                        <th className="pb-2 font-medium">Participación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.por_camion.map((c) => (
                        <tr key={c.camion} className="text-slate-600">
                          <td className="py-2 font-medium text-slate-700">{c.camion}</td>
                          <td className="py-2 tabular-nums">{c.ventas}</td>
                          <td className="whitespace-nowrap py-2 pr-6 text-right font-semibold tabular-nums text-slate-800">
                            {gs(c.total)}
                          </td>
                          <td className="py-2">
                            <Participacion valor={c.participacion} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ── Venta por producto ── */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Venta por producto</h2>
              {data.por_producto.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  No hubo productos vendidos en este mes.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                          <th className="pb-2 font-medium">Producto</th>
                          <th className="pb-2 pr-3 font-medium">Cantidad</th>
                          <th className="pb-2 pr-6 text-right font-medium">Vendido</th>
                          <th className="pb-2 font-medium">Participación</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {productosVisibles.map((p) => (
                          <tr key={p.producto} className="text-slate-600">
                            <td className="py-2 font-medium text-slate-700">{p.producto}</td>
                            <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{cant(p.cantidad, p.unidad)}</td>
                            <td className="whitespace-nowrap py-2 pr-6 text-right font-semibold tabular-nums text-slate-800">
                              {gs(p.total)}
                            </td>
                            <td className="py-2">
                              <Participacion valor={p.participacion} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {data.por_producto.length > 10 ? (
                    <button
                      type="button"
                      onClick={() => setVerTodosProductos((v) => !v)}
                      className="mt-3 text-xs font-semibold text-[#3F8E91] hover:underline"
                    >
                      {verTodosProductos
                        ? "Ver solo los 10 primeros"
                        : `Ver los ${data.por_producto.length} productos`}
                    </button>
                  ) : null}
                </>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
