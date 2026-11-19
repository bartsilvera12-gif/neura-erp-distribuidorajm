"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/fetch-with-supabase-session";

/**
 * Reportes → Ventas por camión: lo vendido en el período por cada camión, con los
 * productos, sus cantidades e importes. Pensado para verse también en la tablet.
 */

type Producto = { producto: string; cantidad: number; importe: number };
type Camion = { camion_id: string | null; camion: string; total: number; cantidad: number; productos: Producto[] };

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
const gs = (v: number) => `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
const cant = (v: number) => (Math.round(v * 100) / 100).toLocaleString("es-PY");
const INPUT = "mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm";

export default function VentasCamionPage() {
  const [desde, setDesde] = useState(`${hoy().slice(0, 8)}01`);
  const [hasta, setHasta] = useState(hoy());
  const [camiones, setCamiones] = useState<Camion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/reportes/ventas-camion?desde=${desde}&hasta=${hasta}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) throw new Error(j?.error ?? `Error ${r.status}`);
      setCamiones((j.data?.camiones ?? []) as Camion[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el reporte.");
      setCamiones(null);
    } finally {
      setCargando(false);
    }
  }, [desde, hasta]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const totalGeneral = (camiones ?? []).reduce((s, c) => s + c.total, 0);

  return (
    <div className="w-full min-w-0 space-y-4 p-4 pb-24 sm:p-0">
      <div>
        <nav className="mb-1 text-xs text-slate-500">
          <Link href="/reportes" className="hover:text-[#4FAEB2]">Reportes</Link> /{" "}
          <span className="font-semibold text-slate-700">Ventas por camión</span>
        </nav>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Ventas por camión</h1>
        <p className="mt-1 text-sm text-slate-500">Productos vendidos por cada camión, con cantidades e importes.</p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-slate-500">Desde
          <input type="date" value={desde} onChange={(e) => e.target.value && setDesde(e.target.value)} className={INPUT} />
        </label>
        <label className="text-xs font-semibold text-slate-500">Hasta
          <input type="date" value={hasta} onChange={(e) => e.target.value && setHasta(e.target.value)} className={INPUT} />
        </label>
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {cargando && !camiones ? <p className="py-10 text-center text-sm text-slate-400">Cargando…</p> : null}

      {camiones ? (
        camiones.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            No hubo ventas en este período.
          </p>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total vendido</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{gs(totalGeneral)}</p>
            </div>
            {camiones.map((c) => (
              <section key={c.camion_id ?? "sin-camion"} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <header className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-3">
                  <h2 className="text-base font-bold text-slate-900">{c.camion}</h2>
                  <p className="text-sm text-slate-600">
                    {cant(c.cantidad)} uds. · <b className="tabular-nums">{gs(c.total)}</b>
                  </p>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs font-semibold text-slate-500">
                      <tr>
                        <th className="px-4 py-2">Producto</th>
                        <th className="px-4 py-2 text-right">Cantidad</th>
                        <th className="px-4 py-2 text-right">Importe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.productos.map((p) => (
                        <tr key={p.producto} className="border-t border-slate-100">
                          <td className="px-4 py-2 text-slate-800">{p.producto}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{cant(p.cantidad)}</td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums">{gs(p.importe)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </>
        )
      ) : null}
    </div>
  );
}
