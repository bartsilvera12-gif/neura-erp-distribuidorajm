"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Plus, Truck } from "lucide-react";
import { useCamiones } from "@/shared/hooks/useRepartos";
import { crearCamion, setCamionActivo } from "@/lib/repartos/storage";

const TEAL = "#4FAEB2";

/**
 * Alta y baja de camiones.
 *
 * La baja es lógica: los repartos viejos apuntan al camión, y borrarlo dejaría
 * el histórico sin poder decir de qué camión salió cada venta.
 *
 * Se abre a pedido y no siempre: dar de alta un camión pasa una vez cada
 * tanto, mientras que abrir el reparto pasa todas las mañanas.
 */
export default function CamionesPanel({ onCambio }: { onCambio?: () => void }) {
  const { camiones, isLoading, mutate } = useCamiones(true);
  // La lista de activos es otra clave de SWR: sin esto, el select del alta de
  // reparto seguiría mostrando los camiones de antes.
  const { mutate: mutateGlobal } = useSWRConfig();
  const [alias, setAlias] = useState("");
  const [patente, setPatente] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAlta() {
    if (guardando) return;
    if (!alias.trim()) {
      setError("Poné un nombre o número de camión.");
      return;
    }
    setGuardando(true);
    setError(null);
    const res = await crearCamion({ alias: alias.trim(), patente: patente.trim() || undefined });
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setAlias("");
    setPatente("");
    await Promise.all([mutate(), mutateGlobal("repartos:camiones:activos")]);
    onCambio?.();
  }

  async function handleActivo(id: string, activo: boolean) {
    setError(null);
    const res = await setCamionActivo(id, activo);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await Promise.all([mutate(), mutateGlobal("repartos:camiones:activos")]);
    onCambio?.();
  }

  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Truck className="h-4 w-4 text-slate-400" />
        Camiones
      </h2>

      {isLoading ? (
        <p className="py-4 text-sm text-slate-400">Cargando camiones…</p>
      ) : camiones.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          Todavía no hay camiones. Dá de alta el primero para poder abrir repartos.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {camiones.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-sm font-medium ${
                    c.activo ? "text-slate-900" : "text-slate-400 line-through"
                  }`}
                >
                  {c.alias}
                </span>
                {c.patente ? (
                  <span className="block text-xs text-slate-500">{c.patente}</span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => handleActivo(c.id, !c.activo)}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                {c.activo ? "Dar de baja" : "Reactivar"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          value={alias}
          onChange={(e) => {
            setError(null);
            setAlias(e.target.value);
          }}
          placeholder="Camión (01, Furgón…)"
          aria-label="Nombre o número del camión"
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
        />
        <input
          value={patente}
          onChange={(e) => setPatente(e.target.value)}
          placeholder="Patente (opcional)"
          aria-label="Patente del camión"
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm uppercase outline-none placeholder:normal-case focus:ring-2 focus:ring-[#4FAEB2]"
        />
        <button
          type="button"
          onClick={handleAlta}
          disabled={guardando}
          className="flex h-10 items-center justify-center gap-1.5 rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-40"
          style={{ backgroundColor: TEAL }}
        >
          <Plus className="h-4 w-4" />
          {guardando ? "Guardando…" : "Agregar"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
