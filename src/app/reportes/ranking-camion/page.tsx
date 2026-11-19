"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/fetch-with-supabase-session";

/**
 * Reportes → Ranking por camión: productos más vendidos y clientes que más
 * compran, de todos los camiones o de uno, por día, semana, mes o rango.
 */

type Producto = { producto: string; cantidad: number; importe: number; ventas: number };
type Cliente = { cliente: string; ventas: number; total: number };
type Datos = {
  camiones: { id: string; alias: string }[];
  ventas: number;
  total: number;
  productos: Producto[];
  clientes: Cliente[];
};
type Periodo = "dia" | "semana" | "mes" | "rango";

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
const gs = (v: number) => `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
const cant = (v: number) => (Math.round(v * 100) / 100).toLocaleString("es-PY");
const INPUT = "mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm";

function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function rangoDe(p: Periodo): { desde: string; hasta: string } {
  const h = hoy();
  if (p === "semana") {
    const dow = new Date(`${h}T12:00:00Z`).getUTCDay(); // 0 = domingo
    return { desde: sumarDias(h, -((dow + 6) % 7)), hasta: h };
  }
  if (p === "mes") return { desde: `${h.slice(0, 8)}01`, hasta: h };
  return { desde: h, hasta: h };
}

export default function RankingCamionPage() {
  const [periodo, setPeriodo] = useState<Periodo>("dia");
  const [desde, setDesde] = useState(hoy());
  const [hasta, setHasta] = useState(hoy());
  const [camionId, setCamionId] = useState("");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  function elegirPeriodo(p: Periodo) {
    setPeriodo(p);
    if (p !== "rango") {
      const r = rangoDe(p);
      setDesde(r.desde);
      setHasta(r.hasta);
    }
  }

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const q = new URLSearchParams({ desde, hasta });
      if (camionId) q.set("camion_id", camionId);
      const r = await apiFetch(`/api/reportes/ranking-camion?${q.toString()}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) throw new Error(j?.error ?? `Error ${r.status}`);
      setDatos(j.data as Datos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el ranking.");
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, camionId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const PERIODOS: { id: Periodo; texto: string }[] = [
    { id: "dia", texto: "Día" },
    { id: "semana", texto: "Semana" },
    { id: "mes", texto: "Mes" },
    { id: "rango", texto: "Rango" },
  ];

  return (
    <div className="w-full min-w-0 space-y-4 p-4 pb-24 sm:p-0">
      <div>
        <nav className="mb-1 text-xs text-slate-500">
          <Link href="/reportes" className="hover:text-[#4FAEB2]">Reportes</Link> /{" "}
          <span className="font-semibold text-slate-700">Ranking por camión</span>
        </nav>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Ranking por camión</h1>
        <p className="mt-1 text-sm text-slate-500">
          Productos más vendidos y clientes que más compran, según las ventas registradas por cada camión.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex gap-1">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => elegirPeriodo(p.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                periodo === p.id ? "border-[#4FAEB2] bg-[#4FAEB2] text-white" : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {p.texto}
            </button>
          ))}
        </div>
        <label className="text-xs font-semibold text-slate-500">Camión
          <select value={camionId} onChange={(e) => setCamionId(e.target.value)} className={INPUT}>
            <option value="">Todos los camiones</option>
            {(datos?.camiones ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.alias}</option>
            ))}
          </select>
        </label>
        {periodo === "rango" ? (
          <>
            <label className="text-xs font-semibold text-slate-500">Desde
              <input type="date" value={desde} onChange={(e) => e.target.value && setDesde(e.target.value)} className={INPUT} />
            </label>
            <label className="text-xs font-semibold text-slate-500">Hasta
              <input type="date" value={hasta} onChange={(e) => e.target.value && setHasta(e.target.value)} className={INPUT} />
            </label>
          </>
        ) : null}
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {cargando && !datos ? <p className="py-10 text-center text-sm text-slate-400">Cargando…</p> : null}

      {datos ? (
        datos.ventas === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            No hubo ventas de camión en este período.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cantidad de ventas</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{datos.ventas.toLocaleString("es-PY")}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total vendido</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{gs(datos.total)}</p>
              </div>
            </div>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <h2 className="bg-slate-50 px-4 py-3 text-base font-bold text-slate-900">Ranking de productos</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs font-semibold text-slate-500">
                    <tr>
                      <th className="px-4 py-2">#</th>
                      <th className="px-4 py-2">Producto</th>
                      <th className="px-4 py-2 text-right">Cantidad</th>
                      <th className="px-4 py-2 text-right">Ventas</th>
                      <th className="px-4 py-2 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.productos.map((p, i) => (
                      <tr key={p.producto} className="border-t border-slate-100">
                        <td className="px-4 py-2 text-slate-500">{i + 1}</td>
                        <td className="px-4 py-2 text-slate-800">{p.producto}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{cant(p.cantidad)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{p.ventas}</td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums">{gs(p.importe)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <h2 className="bg-slate-50 px-4 py-3 text-base font-bold text-slate-900">Ranking de clientes</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs font-semibold text-slate-500">
                    <tr>
                      <th className="px-4 py-2">#</th>
                      <th className="px-4 py-2">Cliente</th>
                      <th className="px-4 py-2 text-right">Ventas</th>
                      <th className="px-4 py-2 text-right">Total comprado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.clientes.map((c, i) => (
                      <tr key={`${c.cliente}-${i}`} className="border-t border-slate-100">
                        <td className="px-4 py-2 text-slate-500">{i + 1}</td>
                        <td className="px-4 py-2 text-slate-800">{c.cliente}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{c.ventas}</td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums">{gs(c.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )
      ) : null}
    </div>
  );
}
