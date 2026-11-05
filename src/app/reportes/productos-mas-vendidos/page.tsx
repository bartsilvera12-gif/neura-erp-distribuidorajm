"use client";

/**
 * Reporte: Productos más vendidos. Filtros Desde/Hasta y Ubicación (todo /
 * salón / camión). Pedido explícito de Distribuidora JM (soporte, punto 4).
 */

import { useEffect, useMemo, useState } from "react";
import { Trophy, Loader2 } from "lucide-react";
import { hoyEnAsuncion } from "@/shared/caja/arqueo-ui";

interface UbicacionMin { id: string; nombre: string; tipo: string }
interface FilaRanking { producto_id: string; nombre: string; sku: string; cantidad: number; total: number }

const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString("es-PY")}`;
const num = (n: number) => n.toLocaleString("es-PY", { maximumFractionDigits: 3 });

export default function ProductosMasVendidosPage() {
  const hoy = hoyEnAsuncion();
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [ubicacionId, setUbicacionId] = useState("");
  const [limit, setLimit] = useState<number>(50);

  const [ubicaciones, setUbicaciones] = useState<UbicacionMin[]>([]);
  const [filas, setFilas] = useState<FilaRanking[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar ubicaciones una vez.
  useEffect(() => {
    let cancel = false;
    fetch("/api/inventario/ubicaciones", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel || !j?.success) return;
        setUbicaciones((j.data?.ubicaciones ?? []) as UbicacionMin[]);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  // Cargar ranking cada vez que cambian los filtros.
  useEffect(() => {
    let cancel = false;
    setCargando(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("formato", "detalle");
    params.set("limit", String(limit));
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    if (ubicacionId) params.set("ubicacion_id", ubicacionId);
    fetch(`/api/productos/mas-vendidos?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) {
          setError(j?.error ?? "No se pudo cargar el ranking.");
          setFilas([]);
          return;
        }
        setFilas((j.data?.filas ?? []) as FilaRanking[]);
      })
      .catch((e) => {
        if (!cancel) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancel) setCargando(false);
      });
    return () => {
      cancel = true;
    };
  }, [desde, hasta, ubicacionId, limit]);

  const totales = useMemo(
    () => ({
      cantidad: filas.reduce((s, f) => s + f.cantidad, 0),
      monto: filas.reduce((s, f) => s + f.total, 0),
    }),
    [filas]
  );

  const labelUbicacion =
    ubicacionId === ""
      ? "todas las ubicaciones"
      : ubicaciones.find((u) => u.id === ubicacionId)?.nombre ?? "ubicación seleccionada";

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Análisis · Comercial</p>
        </div>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          <Trophy className="h-6 w-6 text-[#4FAEB2]" />
          Productos más vendidos
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Ranking por cantidad vendida en el período, filtrado por ubicación. Excluye ventas anuladas.
        </p>
      </div>

      {/* Filtros */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            Desde
            <input
              type="date"
              value={desde}
              max={hasta || hoy}
              onChange={(e) => setDesde(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            Hasta
            <input
              type="date"
              value={hasta}
              min={desde || undefined}
              max={hoy}
              onChange={(e) => setHasta(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            Ubicación
            <select
              value={ubicacionId}
              onChange={(e) => setUbicacionId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            >
              <option value="">Todas (general)</option>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}{u.tipo ? ` · ${u.tipo}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            Mostrar
            <select
              value={String(limit)}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            >
              <option value="20">Top 20</option>
              <option value="50">Top 50</option>
              <option value="100">Top 100</option>
              <option value="500">Top 500</option>
            </select>
          </label>
          <span className="ml-auto text-xs text-slate-500">
            {filas.length} producto{filas.length === 1 ? "" : "s"} · {labelUbicacion}
          </span>
        </div>
      </section>

      {/* Tabla */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {cargando && filas.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando ranking…
          </p>
        ) : error ? (
          <p className="py-10 text-center text-sm text-red-600">{error}</p>
        ) : filas.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">
            Sin ventas en el período para {labelUbicacion}.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 font-medium">Producto</th>
                <th className="px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 font-medium text-right">Cantidad vendida</th>
                <th className="px-4 py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={f.producto_id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 text-xs text-slate-400 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-2 font-medium text-slate-900">{f.nombre || "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{f.sku || "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-900">{num(f.cantidad)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-900">{gs(f.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td colSpan={3} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Totales del listado
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-bold text-slate-900">{num(totales.cantidad)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-bold text-slate-900">{gs(totales.monto)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>
    </div>
  );
}
