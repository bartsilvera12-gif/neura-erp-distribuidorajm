"use client";

/**
 * Metas comerciales mensuales por producto. Pedido Distribuidora JM (soporte,
 * punto 5): cargar objetivos de cantidad vendida por producto para un mes y
 * ver el avance real.
 */

import { useEffect, useMemo, useState } from "react";
import { Target, Plus, Trash2, Loader2, Search } from "lucide-react";
import { hoyEnAsuncion } from "@/shared/caja/arqueo-ui";

interface Meta {
  id: string;
  producto_id: string;
  nombre: string;
  sku: string;
  cantidad_objetivo: number;
  vendido: number;
  faltante: number;
  porcentaje: number;
}

interface ProductoMin {
  id: string;
  nombre: string;
  sku: string;
}

const num = (n: number) => n.toLocaleString("es-PY", { maximumFractionDigits: 3 });

function mesActual(hoy: string): string {
  return hoy.slice(0, 7);
}

function mesLabel(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const nombres = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return `${nombres[m - 1]} de ${a}`;
}

export default function MetasComercialesPage() {
  const hoy = hoyEnAsuncion();
  const [mes, setMes] = useState(mesActual(hoy));
  const [metas, setMetas] = useState<Meta[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // para refrescar después de operaciones

  // Alta de meta.
  const [productos, setProductos] = useState<ProductoMin[]>([]);
  const [agregando, setAgregando] = useState(false);
  const [busq, setBusq] = useState("");
  const [productoElegido, setProductoElegido] = useState<ProductoMin | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    setError(null);
    fetch(`/api/metas-comerciales?mes=${mes}`, { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j?.success) {
          setError(j?.error ?? "No se pudieron cargar las metas.");
          setMetas([]);
          return;
        }
        setMetas((j.data?.filas ?? []) as Meta[]);
      })
      .catch((e) => !cancel && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancel && setCargando(false));
    return () => { cancel = true; };
  }, [mes, tick]);

  useEffect(() => {
    let cancel = false;
    fetch(`/api/productos`, { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel || !j?.success) return;
        setProductos(((j.data?.productos ?? []) as { id: string; nombre: string; sku: string }[]).map((p) => ({
          id: p.id, nombre: p.nombre, sku: p.sku,
        })));
      })
      .catch(() => undefined);
    return () => { cancel = true; };
  }, []);

  const productosFiltrados = useMemo(() => {
    const q = busq.trim().toLowerCase();
    if (!q) return productos.slice(0, 20);
    return productos.filter((p) =>
      `${p.nombre} ${p.sku}`.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [productos, busq]);

  async function guardarAlta() {
    if (!productoElegido) return setErrorAlta("Elegí un producto.");
    const n = Number(cantidad);
    if (!(n > 0)) return setErrorAlta("La cantidad objetivo tiene que ser mayor a 0.");
    setGuardando(true);
    setErrorAlta(null);
    try {
      const r = await fetch(`/api/metas-comerciales`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mes, producto_id: productoElegido.id, cantidad_objetivo: n }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) {
        setErrorAlta(j?.error ?? "No se pudo guardar.");
        return;
      }
      setAgregando(false);
      setBusq("");
      setProductoElegido(null);
      setCantidad("");
      setTick((t) => t + 1);
    } catch (e) {
      setErrorAlta(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(id: string) {
    if (!window.confirm("¿Borrar esta meta?")) return;
    try {
      await fetch(`/api/metas-comerciales?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      setTick((t) => t + 1);
    } catch { /* silencioso */ }
  }

  const totales = useMemo(
    () => ({
      objetivo: metas.reduce((s, m) => s + m.cantidad_objetivo, 0),
      vendido: metas.reduce((s, m) => s + m.vendido, 0),
    }),
    [metas]
  );
  const cumplePromedio = totales.objetivo > 0 ? Math.round((totales.vendido / totales.objetivo) * 1000) / 10 : 0;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Análisis · Comercial</p>
        </div>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          <Target className="h-6 w-6 text-[#4FAEB2]" />
          Metas comerciales
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Objetivos de cantidad vendida por producto y mes, con el avance real.
        </p>
      </div>

      {/* Filtros */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            Mes
            <input
              type="month"
              value={mes}
              max={mesActual(hoy)}
              onChange={(e) => setMes(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            />
          </label>
          <span className="text-xs text-slate-500">{mesLabel(mes)}</span>
          <button
            type="button"
            onClick={() => setAgregando(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#3F8E91]"
          >
            <Plus className="h-4 w-4" />
            Agregar meta
          </button>
        </div>

        {/* Formulario de alta inline */}
        {agregando ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600">Nueva meta para {mesLabel(mes)}</p>
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-[18rem] flex-1">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    autoFocus
                    type="search"
                    value={busq}
                    onChange={(e) => { setBusq(e.target.value); setProductoElegido(null); }}
                    placeholder="Buscar producto por nombre o SKU…"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                  />
                </div>
                {!productoElegido && busq.trim() !== "" ? (
                  <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                    {productosFiltrados.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-slate-400">Sin coincidencias.</li>
                    ) : productosFiltrados.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => { setProductoElegido(p); setBusq(`${p.nombre} · ${p.sku}`); }}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                        >
                          <span className="truncate">{p.nombre}</span>
                          <span className="font-mono text-xs text-slate-400">{p.sku}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <input
                type="number"
                step="0.001"
                min="0"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="Cantidad objetivo"
                className="w-44 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
              />
              <button
                type="button"
                onClick={guardarAlta}
                disabled={guardando}
                className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50"
              >
                {guardando ? "Guardando…" : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => { setAgregando(false); setBusq(""); setProductoElegido(null); setCantidad(""); setErrorAlta(null); }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
            {errorAlta ? <p className="mt-2 text-xs text-red-600">{errorAlta}</p> : null}
          </div>
        ) : null}
      </section>

      {/* Totales */}
      {metas.length > 0 ? (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Objetivo total</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{num(totales.objetivo)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Vendido real</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{num(totales.vendido)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Cumplimiento promedio</p>
            <p className={`mt-1 text-xl font-semibold tabular-nums ${cumplePromedio >= 100 ? "text-emerald-600" : cumplePromedio >= 50 ? "text-amber-600" : "text-red-600"}`}>
              {cumplePromedio.toLocaleString("es-PY")}%
            </p>
          </div>
        </section>
      ) : null}

      {/* Tabla */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {cargando && metas.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando metas…
          </p>
        ) : error ? (
          <p className="py-10 text-center text-sm text-red-600">{error}</p>
        ) : metas.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">
            Todavía no cargaste metas para {mesLabel(mes)}. Usá «Agregar meta» para empezar.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Producto</th>
                <th className="px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 font-medium text-right">Meta</th>
                <th className="px-4 py-2 font-medium text-right">Vendido</th>
                <th className="px-4 py-2 font-medium text-right">Faltante</th>
                <th className="px-4 py-2 font-medium">% cumplido</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {metas.map((m) => (
                <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-900">{m.nombre}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{m.sku || "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-900">{num(m.cantidad_objetivo)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-900">{num(m.vendido)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">{num(m.faltante)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full ${m.porcentaje >= 100 ? "bg-emerald-500" : m.porcentaje >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${Math.min(100, m.porcentaje)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-semibold tabular-nums ${m.porcentaje >= 100 ? "text-emerald-700" : m.porcentaje >= 50 ? "text-amber-700" : "text-red-700"}`}>
                        {m.porcentaje.toLocaleString("es-PY")}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => borrar(m.id)}
                      aria-label="Borrar meta"
                      className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
