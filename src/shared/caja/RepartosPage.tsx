"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Search, Truck, X } from "lucide-react";
import { useProductos } from "@/shared/hooks/useInventario";
import { useCamiones, useRepartos } from "@/shared/hooks/useRepartos";
import { useUsuarios } from "@/shared/hooks/useUsuarios";
import { abrirReparto } from "@/lib/repartos/storage";
import { hoyEnAsuncion } from "@/shared/caja/arqueo-ui";
import ControlMercaderia from "@/shared/caja/ControlMercaderia";

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
  const [abriendo, setAbriendo] = useState(false);

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

      {disponible && !abriendo ? (
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
        <FormularioCarga
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
            <ControlMercaderia key={r.id} reparto={r} onCerrado={() => mutate()} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Alta de reparto con su carga ─────────────────────────────────────────────

/**
 * El camión y el repartidor se eligen de las tablas del ERP (`camiones`,
 * `usuarios`) y no se escriben a mano: `repartos` los guarda por id, y un texto
 * libre no se podría ligar al camión que después hay que cerrar.
 */
function FormularioCarga({
  onCancelar,
  onCreado,
}: {
  onCancelar: () => void;
  onCreado: () => void;
}) {
  const { productos, isLoading } = useProductos();
  const { camiones, isLoading: cargandoCamiones } = useCamiones();
  const { usuarios } = useUsuarios();

  const [camionId, setCamionId] = useState("");
  const [repartidorId, setRepartidorId] = useState("");
  const [query, setQuery] = useState("");
  const [cargas, setCargas] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter(
      (p) => p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  }, [productos, query]);

  const items = useMemo(
    () =>
      Object.entries(cargas)
        .map(([producto_id, v]) => ({ producto_id, cantidad_inicial: Number(v) }))
        .filter((i) => Number.isFinite(i.cantidad_inicial) && i.cantidad_inicial > 0),
    [cargas]
  );

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
    if (items.length === 0) {
      setError("Cargá al menos un producto.");
      return;
    }
    setGuardando(true);
    setError(null);
    const res = await abrirReparto({ camion_id: camionId, repartidor_id: repartidorId, items });
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
            <option value="">
              {cargandoCamiones ? "Cargando camiones…" : "Elegí un camión"}
            </option>
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
            {usuarios.map((u) => (
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

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar producto para cargar…"
          className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
        />
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-slate-400">Cargando productos…</p>
      ) : (
        <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
          {filtrados.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">
                  {p.nombre}
                </span>
                <span className="block text-xs text-slate-500">
                  Stock en depósito: {p.stock_actual} {p.unidad_medida}
                </span>
              </span>
              <input
                inputMode="decimal"
                placeholder="0"
                value={cargas[p.id] ?? ""}
                onChange={(e) => {
                  setError(null);
                  setCargas((prev) => ({ ...prev, [p.id]: e.target.value }));
                }}
                aria-label={`Cantidad a cargar de ${p.nombre}`}
                className="h-9 w-24 shrink-0 rounded-lg border border-slate-200 px-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-[#4FAEB2]"
              />
              <span className="w-8 shrink-0 text-xs text-slate-400">{p.unidad_medida}</span>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {items.length} {items.length === 1 ? "producto" : "productos"} en la carga
        </p>
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
