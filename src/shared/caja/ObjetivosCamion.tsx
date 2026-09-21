"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Search, Target, X } from "lucide-react";
import { getObjetivos, guardarObjetivos } from "@/lib/repartos/storage";
import type { Camion, ObjetivoCamion } from "@/lib/repartos/types";

const TEAL = "#4FAEB2";

/** Cantidad sin decimales de más. */
function n(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Objetivo de carga del camión: cuánto de cada producto debería llevar cuando
 * sale (documento v0.2, pág. 6).
 *
 * Es un objetivo fijo por producto. Con eso, la carga de la mañana se sugiere
 * sola: objetivo menos lo que quedó del día anterior.
 *
 * Vaciar un objetivo saca al producto de la sugerencia, que es distinto de
 * ponerle 0: un producto sin objetivo simplemente no se sugiere.
 */
export default function ObjetivosCamion({
  camion,
  onCerrar,
}: {
  camion: Camion;
  onCerrar: () => void;
}) {
  const { data, isLoading, mutate } = useSWR<ObjetivoCamion[]>(
    `repartos:objetivos:${camion.id}`,
    () => getObjetivos(camion.id),
    { revalidateOnFocus: false }
  );

  const [query, setQuery] = useState("");
  const [editados, setEditados] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  const productos = useMemo(() => data ?? [], [data]);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter((p) => p.nombre.toLowerCase().includes(q));
  }, [productos, query]);

  function valorDe(p: ObjetivoCamion): string {
    const e = editados[p.producto_id];
    if (e !== undefined) return e;
    return p.objetivo === null ? "" : String(p.objetivo);
  }

  const invalidos = Object.values(editados).filter(
    (v) => v.trim() !== "" && (!Number.isFinite(Number(v)) || Number(v) < 0)
  ).length;

  async function handleGuardar() {
    if (guardando) return;
    if (invalidos > 0) {
      setError("Hay objetivos inválidos.");
      return;
    }
    const items = Object.entries(editados).map(([producto_id, v]) => ({
      producto_id,
      objetivo: v.trim() === "" ? null : Number(v),
    }));
    if (items.length === 0) {
      onCerrar();
      return;
    }

    setGuardando(true);
    setError(null);
    const res = await guardarObjetivos(camion.id, items);
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setEditados({});
    setGuardado(true);
    await mutate();
  }

  return (
    <section className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Target className="h-4 w-4 text-[#4FAEB2]" />
          Objetivo de carga · Camión {camion.alias}
        </h3>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="rounded p-1 text-slate-400 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mb-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
        Cuánto debería llevar el camión de cada producto. Con esto, la carga de la mañana se
        sugiere sola: objetivo menos lo que quedó del día anterior. Dejalo vacío para que ese
        producto no se sugiera.
      </p>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar producto…"
          className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
        />
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-slate-400">Cargando productos…</p>
      ) : (
        <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
          {filtrados.map((p) => (
            <li
              key={p.producto_id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">
                  {p.nombre}
                </span>
                <span className="block text-xs text-slate-500">
                  En el camión: {n(p.actual)} {p.unidad}
                  {p.sugerido > 0 ? (
                    <span className="font-semibold text-[#3F8E91]"> · faltan {n(p.sugerido)}</span>
                  ) : null}
                </span>
              </span>
              <input
                inputMode="decimal"
                placeholder="—"
                value={valorDe(p)}
                onChange={(e) => {
                  setError(null);
                  setGuardado(false);
                  setEditados((prev) => ({ ...prev, [p.producto_id]: e.target.value }));
                }}
                aria-label={`Objetivo de ${p.nombre}`}
                className="h-9 w-24 shrink-0 rounded-lg border border-slate-200 px-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-[#4FAEB2]"
              />
              <span className="w-8 shrink-0 text-xs text-slate-400">{p.unidad}</span>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {guardado ? (
        <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">
          Objetivos guardados.
        </p>
      ) : null}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleGuardar}
          disabled={guardando}
          className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          style={{ backgroundColor: TEAL }}
        >
          {guardando ? "Guardando…" : "Guardar objetivos"}
        </button>
      </div>
    </section>
  );
}
