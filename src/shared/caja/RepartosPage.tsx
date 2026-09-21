"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, Truck, X } from "lucide-react";
import { useCamiones, useRepartidores, useRepartos } from "@/shared/hooks/useRepartos";
import { abrirReparto } from "@/lib/repartos/storage";
import { hoyEnAsuncion } from "@/shared/caja/arqueo-ui";
import ControlMercaderia from "@/shared/caja/ControlMercaderia";
import CamionesPanel from "@/shared/caja/CamionesPanel";

const TEAL = "#4FAEB2";

/**
 * Repartos del día: los que están en la calle, los ya cerrados, y el alta de
 * uno nuevo con la carga del camión.
 *
 * Una sola pantalla responsive: se usa en el celular a la mañana (cargar) y en
 * la computadora a la tarde (cerrar), con el mismo contenido.
 */
export default function RepartosPage() {
  const [fecha, setFecha] = useState(hoyEnAsuncion());
  const { repartos, disponible, isLoading, mutate } = useRepartos({ fecha });
  const { camiones, isLoading: cargandoCamiones } = useCamiones();
  const [abriendo, setAbriendo] = useState(false);
  const [administrando, setAdministrando] = useState(false);

  // Sin camiones activos no se puede abrir nada, así que el panel se abre solo:
  // ofrecer "Abrir reparto" con el select vacío sería un callejón sin salida.
  const sinCamiones = disponible && !cargandoCamiones && camiones.length === 0;
  const mostrarCamiones = administrando || sinCamiones;

  return (
    <div className="mx-auto max-w-5xl p-4 pb-24 sm:p-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Repartos</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Carga del camión y control de lo que vuelve.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fecha}
            max={hoyEnAsuncion()}
            onChange={(e) => setFecha(e.target.value)}
            aria-label="Fecha de los repartos"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          />
          <button
            type="button"
            onClick={() => setAdministrando((v) => !v)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Camiones
          </button>
          <Link
            href="/ventas/cierre"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cierre
          </Link>
        </div>
      </header>

      {!disponible && !isLoading ? (
        <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          Este schema no tiene el dominio de repartos (<code>repartos</code> y{" "}
          <code>reparto_stock</code>), así que la carga del camión y el control de mercadería no
          están disponibles.
        </p>
      ) : null}

      {mostrarCamiones ? <CamionesPanel /> : null}

      {disponible && !abriendo && camiones.length > 0 ? (
        <button
          type="button"
          onClick={() => setAbriendo(true)}
          className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white sm:w-auto sm:px-6"
          style={{ backgroundColor: TEAL }}
        >
          <Plus className="h-4 w-4" />
          Abrir reparto
        </button>
      ) : null}

      {abriendo ? (
        <FormularioApertura
          onCancelar={() => setAbriendo(false)}
          onCreado={() => {
            setAbriendo(false);
            mutate();
          }}
        />
      ) : null}

      {isLoading ? (
        <p className="py-10 text-center text-sm text-slate-400">Cargando repartos…</p>
      ) : repartos.length === 0 && disponible ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center">
          <Truck className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">No hay repartos este día.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {repartos.map((r) => (
            <ControlMercaderia
              key={r.id}
              reparto={r}
              onCerrado={() => mutate()}
              onActualizar={() => mutate()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Apertura de la jornada ───────────────────────────────────────────────────

/**
 * Abrir un reparto no carga mercadería: el camión ya tiene su stock, que es el
 * remanente del cierre anterior. Solo se elige quién sale y con qué camión.
 *
 * Reponer es otra cosa —la carga de proveedor— y tiene su propia pantalla.
 */
function FormularioApertura({
  onCancelar,
  onCreado,
}: {
  onCancelar: () => void;
  onCreado: () => void;
}) {
  const { camiones, isLoading: cargandoCamiones } = useCamiones();
  const { repartidores, isLoading: cargandoRepartidores } = useRepartidores();

  const [camionId, setCamionId] = useState("");
  const [repartidorId, setRepartidorId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGuardar() {
    if (guardando) return;
    if (!camionId) {
      setError("Elegí el camión.");
      return;
    }
    if (!repartidorId) {
      setError("Elegí el repartidor.");
      return;
    }
    setGuardando(true);
    setError(null);
    const res = await abrirReparto({ camion_id: camionId, repartidor_id: repartidorId });
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onCreado();
  }

  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Abrir reparto</h2>
        <button
          type="button"
          onClick={onCancelar}
          aria-label="Cancelar"
          className="rounded p-1 text-slate-400 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Camión</span>
          <select
            value={camionId}
            onChange={(e) => {
              setError(null);
              setCamionId(e.target.value);
            }}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          >
            <option value="">{cargandoCamiones ? "Cargando camiones…" : "Elegí un camión"}</option>
            {camiones.map((c) => (
              <option key={c.id} value={c.id}>
                {c.alias}
                {c.patente ? ` · ${c.patente}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Repartidor</span>
          <select
            value={repartidorId}
            onChange={(e) => {
              setError(null);
              setRepartidorId(e.target.value);
            }}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          >
            <option value="">Elegí un repartidor</option>
            {repartidores.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre ?? u.email}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!cargandoCamiones && camiones.length === 0 ? (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          No hay camiones activos cargados. Dalos de alta antes de abrir un reparto.
        </p>
      ) : null}

      {!cargandoRepartidores && repartidores.length === 0 ? (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          Ningún usuario tiene el rol <strong>Vendedor móvil</strong>, que es el que sale con el
          camión. Asignáselo en Usuarios y volvé acá.
        </p>
      ) : null}

      <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
        El reparto arranca con lo que quedó arriba del camión en el cierre anterior. Para reponer,
        registrá una carga de proveedor.
      </p>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
          {error}
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
          {guardando ? "Abriendo…" : "Abrir reparto"}
        </button>
      </div>
    </section>
  );
}
