"use client";

/**
 * Reporte: ranking de clientes con 3 pestañas: top compradores, morosos,
 * inactivos. Pedido explícito de Distribuidora JM (soporte, punto 6).
 */

import { useEffect, useState } from "react";
import { Users, Loader2 } from "lucide-react";
import { hoyEnAsuncion } from "@/shared/caja/arqueo-ui";

type Vista = "top" | "morosos" | "inactivos";

const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString("es-PY")}`;

export default function RankingClientesPage() {
  const hoy = hoyEnAsuncion();
  const [vista, setVista] = useState<Vista>("top");

  // Parámetros por vista.
  const [desde, setDesde] = useState(() => {
    // Default top: últimos 30 días.
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  });
  const [hasta, setHasta] = useState(hoy);
  const [moraMin, setMoraMin] = useState(8);
  const [inactivoDias, setInactivoDias] = useState(60);
  const [limit, setLimit] = useState(100);

  const [filas, setFilas] = useState<Record<string, unknown>[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("vista", vista);
    params.set("limit", String(limit));
    if (vista === "top") {
      params.set("desde", desde);
      params.set("hasta", hasta);
    } else if (vista === "morosos") {
      params.set("mora_min", String(moraMin));
    } else {
      params.set("desde_dias", String(inactivoDias));
    }
    fetch(`/api/reportes/ranking-clientes?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) {
          setError(j?.error ?? "No se pudo cargar el reporte.");
          setFilas([]);
          return;
        }
        setFilas((j.data?.filas ?? []) as Record<string, unknown>[]);
      })
      .catch((e) => !cancel && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancel && setCargando(false));
    return () => { cancel = true; };
  }, [vista, desde, hasta, moraMin, inactivoDias, limit]);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Análisis · Comercial</p>
        </div>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          <Users className="h-6 w-6 text-[#4FAEB2]" />
          Clientes
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Mejores compradores, clientes con mora y clientes inactivos.
        </p>
      </div>

      {/* Tabs */}
      <nav className="flex gap-2 border-b border-slate-200">
        {[
          { id: "top" as Vista, label: "Mejores compradores" },
          { id: "morosos" as Vista, label: "Morosos" },
          { id: "inactivos" as Vista, label: "Inactivos" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setVista(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
              vista === t.id
                ? "border-[#4FAEB2] text-[#3F8E91]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Filtros por vista */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {vista === "top" ? (
            <>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                Desde
                <input type="date" value={desde} max={hasta || hoy} onChange={(e) => setDesde(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                Hasta
                <input type="date" value={hasta} min={desde || undefined} max={hoy} onChange={(e) => setHasta(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]" />
              </label>
            </>
          ) : vista === "morosos" ? (
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              Mora mínima
              <select value={moraMin} onChange={(e) => setMoraMin(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]">
                <option value={1}>≥ 1 día vencido</option>
                <option value={8}>≥ 8 días vencido</option>
                <option value={15}>≥ 15 días vencido</option>
                <option value={30}>≥ 30 días vencido</option>
                <option value={60}>≥ 60 días vencido</option>
              </select>
            </label>
          ) : (
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              Sin comprar desde hace
              <select value={inactivoDias} onChange={(e) => setInactivoDias(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]">
                <option value={30}>≥ 30 días</option>
                <option value={60}>≥ 60 días</option>
                <option value={90}>≥ 90 días</option>
                <option value={180}>≥ 180 días</option>
                <option value={365}>≥ 1 año</option>
              </select>
            </label>
          )}
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            Mostrar
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]">
              <option value={50}>Top 50</option>
              <option value={100}>Top 100</option>
              <option value={500}>Top 500</option>
              <option value={1000}>Top 1000</option>
            </select>
          </label>
          <span className="ml-auto text-xs text-slate-500">{filas.length} cliente{filas.length === 1 ? "" : "s"}</span>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {cargando && filas.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando…
          </p>
        ) : error ? (
          <p className="py-10 text-center text-sm text-red-600">{error}</p>
        ) : filas.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">Sin resultados.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">RUC / Doc.</th>
                {vista === "top" ? (
                  <>
                    <th className="px-4 py-2 font-medium text-right">Operaciones</th>
                    <th className="px-4 py-2 font-medium text-right">Total comprado</th>
                  </>
                ) : vista === "morosos" ? (
                  <>
                    <th className="px-4 py-2 font-medium text-right">Facturas</th>
                    <th className="px-4 py-2 font-medium text-right">Saldo</th>
                    <th className="px-4 py-2 font-medium text-right">Vencido</th>
                    <th className="px-4 py-2 font-medium text-right">Mora máx.</th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-2 font-medium">Última compra</th>
                    <th className="px-4 py-2 font-medium text-right">Días sin comprar</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={String(f.cliente_id)} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 text-xs text-slate-400 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-2 font-medium text-slate-900">{String(f.nombre ?? "—")}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{String(f.ruc ?? "—")}</td>
                  {vista === "top" ? (
                    <>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-900">{Number(f.operaciones) || 0}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-900">{gs(Number(f.total) || 0)}</td>
                    </>
                  ) : vista === "morosos" ? (
                    <>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-900">{Number(f.facturas) || 0}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-900">{gs(Number(f.saldo_total) || 0)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-red-700">{gs(Number(f.vencido) || 0)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-900">{Number(f.dias_mora_max) || 0} día{Number(f.dias_mora_max) === 1 ? "" : "s"}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2 tabular-nums text-slate-700">{String(f.ultima_compra ?? "—").slice(0, 10)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-900">{Number(f.dias_sin_comprar) || 0}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
