"use client";

/**
 * Inventario histórico por fecha. Pedido Distribuidora JM (soporte, punto 9).
 *
 * Reconstruye el stock al inicio del día pedido restando los movimientos
 * posteriores desde el stock actual. Es una ESTIMACIÓN: lo aclaramos en
 * pantalla porque no incluye movimientos que viven fuera de
 * `movimientos_inventario` (ej. traslados camión↔salón vía `reparto_stock`).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, History, AlertTriangle } from "lucide-react";
import { hoyEnAsuncion } from "@/shared/caja/arqueo-ui";

interface Fila {
  producto_id: string;
  nombre: string;
  sku: string;
  unidad_medida: string | null;
  stock_actual: number;
  stock_historico: number;
}

const num = (n: number) => n.toLocaleString("es-PY", { maximumFractionDigits: 3 });

export default function InventarioHistoricoPage() {
  const hoy = hoyEnAsuncion();
  // Default: ayer. "Hoy" daría lo mismo que /inventario, así que empezamos un día atrás.
  const ayer = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }, []);
  const [fecha, setFecha] = useState(ayer);
  const [query, setQuery] = useState("");
  const [soloConStock, setSoloConStock] = useState(true);
  const [ordenPor, setOrdenPor] = useState<"stock_desc" | "stock_asc" | "nombre">("stock_desc");

  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    setError(null);
    fetch(`/api/inventario/stock-historico?fecha=${fecha}`, { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) {
          setError(j?.error ?? "No se pudo reconstruir el stock.");
          setFilas([]);
          return;
        }
        setFilas((j.data?.filas ?? []) as Fila[]);
      })
      .catch((e) => !cancel && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancel && setCargando(false));
    return () => { cancel = true; };
  }, [fecha]);

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    let arr = filas.filter((f) => {
      if (soloConStock && f.stock_historico <= 0) return false;
      if (!q) return true;
      const hay = `${f.nombre} ${f.sku}`.toLowerCase();
      return q.split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
    });
    arr = arr.slice();
    if (ordenPor === "stock_desc") arr.sort((a, b) => b.stock_historico - a.stock_historico);
    else if (ordenPor === "stock_asc") arr.sort((a, b) => a.stock_historico - b.stock_historico);
    else arr.sort((a, b) => a.nombre.localeCompare(b.nombre));
    return arr;
  }, [filas, query, soloConStock, ordenPor]);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Operaciones · Inventario</p>
        </div>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          <History className="h-6 w-6 text-[#4FAEB2]" />
          Inventario a una fecha
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Cuánto stock había de cada producto al inicio del día elegido (reconstruido a partir del stock actual menos los movimientos posteriores).
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5" />
          Es una estimación: los movimientos que viven fuera de "Movimientos de inventario" (por ejemplo traslados camión↔salón) no entran en el cálculo.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            Fecha
            <input
              type="date"
              value={fecha}
              max={hoy}
              onChange={(e) => setFecha(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            />
          </label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o código…"
            className="min-w-[14rem] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          />
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            Orden
            <select
              value={ordenPor}
              onChange={(e) => setOrdenPor(e.target.value as "stock_desc" | "stock_asc" | "nombre")}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            >
              <option value="stock_desc">Mayor stock primero</option>
              <option value="stock_asc">Menor stock primero</option>
              <option value="nombre">Nombre (A-Z)</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={soloConStock}
              onChange={(e) => setSoloConStock(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#4FAEB2]"
            />
            Ocultar los que tenían 0
          </label>
          <span className="ml-auto text-xs text-slate-500">{filtradas.length} producto{filtradas.length === 1 ? "" : "s"}</span>
          <Link href="/inventario" className="text-[11px] font-semibold text-[#3F8E91] underline-offset-2 hover:underline">← Volver al inventario actual</Link>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {cargando && filas.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Reconstruyendo stock al {fecha}…
          </p>
        ) : error ? (
          <p className="py-10 text-center text-sm text-red-600">{error}</p>
        ) : filtradas.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">
            Sin productos para mostrar.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Producto</th>
                <th className="px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 font-medium text-right">Stock al {fecha}</th>
                <th className="px-4 py-2 font-medium text-right">Stock actual</th>
                <th className="px-4 py-2 font-medium">Unidad</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((f) => (
                <tr key={f.producto_id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-900">{f.nombre || "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{f.sku || "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-900">{num(f.stock_historico)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">{num(f.stock_actual)}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{f.unidad_medida ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
