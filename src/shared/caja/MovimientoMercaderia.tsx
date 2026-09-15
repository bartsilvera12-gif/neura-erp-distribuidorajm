"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowDownToLine, ArrowUpFromLine, Search, X } from "lucide-react";
import { useProductos } from "@/shared/hooks/useInventario";
import { getUbicaciones, registrarMovimiento } from "@/lib/repartos/storage";
import type { Reparto, Ubicacion } from "@/lib/repartos/types";

const TEAL = "#4FAEB2";

/**
 * Los dos movimientos del ciclo diario (documento v0.2, pág. 4).
 *
 * - Carga de proveedor: entra mercadería nueva al camión, a la mañana o en una
 *   reposición. Sube el stock del camión y el total de la empresa.
 * - Descarga en salón: el camión deja parte de lo que trajo. Baja el camión y
 *   sube el destino; el total de la empresa no se mueve, porque la mercadería
 *   no entró ni salió: cambió de lugar.
 */
export default function MovimientoMercaderia({
  reparto,
  tipo,
  onCerrar,
  onHecho,
}: {
  reparto: Reparto;
  tipo: "carga" | "transferencia";
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const { productos, isLoading } = useProductos();
  const { data: ubicaciones } = useSWR<Ubicacion[]>(
    tipo === "transferencia" ? "repartos:ubicaciones" : null,
    () => getUbicaciones(),
    { revalidateOnFocus: false, dedupingInterval: 2 * 60_000 }
  );

  const [query, setQuery] = useState("");
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [destinoId, setDestinoId] = useState("");
  const [referencia, setReferencia] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esCarga = tipo === "carga";

  // En una descarga solo se puede mover lo que hay arriba del camión, así que
  // la lista son sus productos y no el catálogo entero.
  const disponibles = useMemo(() => {
    if (esCarga) return productos;
    const enCamion = new Map(reparto.items.map((i) => [i.producto_id, i.teorico]));
    return productos.filter((p) => (enCamion.get(p.id) ?? 0) > 0);
  }, [esCarga, productos, reparto.items]);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return disponibles;
    return disponibles.filter(
      (p) => p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  }, [disponibles, query]);

  const items = useMemo(
    () =>
      Object.entries(cantidades)
        .map(([producto_id, v]) => ({ producto_id, cantidad: Number(v) }))
        .filter((i) => Number.isFinite(i.cantidad) && i.cantidad > 0),
    [cantidades]
  );

  const enCamion = useMemo(
    () => new Map(reparto.items.map((i) => [i.producto_id, { teorico: i.teorico, unidad: i.unidad }])),
    [reparto.items]
  );

  async function handleGuardar() {
    if (guardando) return;
    if (items.length === 0) {
      setError("Poné al menos una cantidad.");
      return;
    }
    if (!esCarga && !destinoId) {
      setError("Elegí a dónde va la mercadería.");
      return;
    }
    setGuardando(true);
    setError(null);
    const res = await registrarMovimiento(reparto.id, {
      tipo,
      items,
      destino_id: esCarga ? undefined : destinoId,
      referencia: referencia.trim() || undefined,
    });
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onHecho();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {esCarga ? (
            <ArrowDownToLine className="h-4 w-4 text-[#4FAEB2]" />
          ) : (
            <ArrowUpFromLine className="h-4 w-4 text-[#4FAEB2]" />
          )}
          {esCarga
            ? `Cargar mercadería en el camión ${reparto.camion}`
            : `Descargar del camión ${reparto.camion}`}
        </h3>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cancelar"
          className="rounded p-1 text-slate-400 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {esCarga ? null : (
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">A dónde va</span>
          <select
            value={destinoId}
            onChange={(e) => {
              setError(null);
              setDestinoId(e.target.value);
            }}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2] sm:max-w-xs"
          >
            <option value="">Elegí el destino</option>
            {(ubicaciones ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="mb-3 block">
        <span className="mb-1 block text-xs font-medium text-slate-600">
          {esCarga ? "Proveedor o documento (opcional)" : "Referencia (opcional)"}
        </span>
        <input
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
          placeholder={esCarga ? "Remito 12345 · Avícola del Este" : "Descarga de la mañana"}
          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
        />
      </label>

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
      ) : filtrados.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          {esCarga ? "No hay productos." : "El camión no tiene mercadería para descargar."}
        </p>
      ) : (
        <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
          {filtrados.map((p) => {
            const arriba = enCamion.get(p.id);
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {p.nombre}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {esCarga
                      ? `En el camión: ${arriba?.teorico ?? 0} ${p.unidad_medida}`
                      : `Disponible: ${arriba?.teorico ?? 0} ${p.unidad_medida}`}
                  </span>
                </span>
                <input
                  inputMode="decimal"
                  placeholder="0"
                  value={cantidades[p.id] ?? ""}
                  onChange={(e) => {
                    setError(null);
                    setCantidades((prev) => ({ ...prev, [p.id]: e.target.value }));
                  }}
                  aria-label={`Cantidad de ${p.nombre}`}
                  className="h-9 w-24 shrink-0 rounded-lg border border-slate-200 px-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                />
                <span className="w-8 shrink-0 text-xs text-slate-400">{p.unidad_medida}</span>
              </li>
            );
          })}
        </ul>
      )}

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {items.length} {items.length === 1 ? "producto" : "productos"}
        </p>
        <button
          type="button"
          onClick={handleGuardar}
          disabled={guardando}
          className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          style={{ backgroundColor: TEAL }}
        >
          {guardando ? "Guardando…" : esCarga ? "Registrar carga" : "Registrar descarga"}
        </button>
      </div>
    </section>
  );
}
