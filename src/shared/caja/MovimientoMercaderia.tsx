"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowDownToLine, ArrowUpFromLine, Plus, Search, Wand2, X } from "lucide-react";
import { useProductos } from "@/shared/hooks/useInventario";
import {
  crearUbicacionDeposito,
  getObjetivos,
  getUbicaciones,
  registrarMovimiento,
} from "@/lib/repartos/storage";
import type { ObjetivoCamion, Reparto, Ubicacion } from "@/lib/repartos/types";

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
  const {
    data: ubicaciones,
    isLoading: cargandoUbicaciones,
    mutate: recargarUbicaciones,
  } = useSWR<Ubicacion[]>(
    tipo === "transferencia" ? "repartos:ubicaciones" : null,
    () => getUbicaciones(),
    { revalidateOnFocus: false, dedupingInterval: 2 * 60_000 }
  );
  // Objetivo de carga: solo hace falta para cargar. El remanente lo trae el
  // servidor, así que la sugerencia ya viene calculada.
  const { data: objetivos } = useSWR<ObjetivoCamion[]>(
    tipo === "carga" ? `repartos:objetivos:${reparto.camion_id}` : null,
    () => getObjetivos(reparto.camion_id),
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  );

  const [query, setQuery] = useState("");
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [destinoId, setDestinoId] = useState("");
  const [creandoDeposito, setCreandoDeposito] = useState(false);
  const [referencia, setReferencia] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esCarga = tipo === "carga";

  // Con un solo depósito no hay nada que decidir: elegirlo a mano es un paso
  // que solo sirve para olvidarse y comerse el error en rojo.
  useEffect(() => {
    if (esCarga) return;
    if (destinoId !== "") return;
    if (ubicaciones?.length === 1) setDestinoId(ubicaciones[0].id);
  }, [esCarga, destinoId, ubicaciones]);

  async function crearDeposito() {
    if (creandoDeposito) return;
    setCreandoDeposito(true);
    setError(null);
    const res = await crearUbicacionDeposito();
    setCreandoDeposito(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDestinoId(res.ubicacion.id);
    void recargarUbicaciones();
  }

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

  const porObjetivo = useMemo(
    () => new Map((objetivos ?? []).map((o) => [o.producto_id, o])),
    [objetivos]
  );
  const conSugerencia = useMemo(
    () => (objetivos ?? []).filter((o) => o.sugerido > 0),
    [objetivos]
  );

  /** Completa las cantidades con objetivo − remanente. */
  function usarSugerido() {
    setError(null);
    setCantidades((prev) => {
      const next = { ...prev };
      for (const o of conSugerencia) next[o.producto_id] = String(o.sugerido);
      return next;
    });
  }

  async function handleGuardar() {
    if (guardando) return;
    if (items.length === 0) {
      setError("Poné al menos una cantidad.");
      return;
    }
    if (!esCarga && !destinoId) {
      setError(
        (ubicaciones ?? []).length === 0
          ? "Creá el depósito de arriba: la mercadería que baja tiene que quedar en algún lado."
          : "Elegí a dónde va la mercadería."
      );
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

      {esCarga ? null : cargandoUbicaciones && !ubicaciones ? (
        <p className="mb-3 text-xs text-slate-400">Buscando a dónde se puede descargar…</p>
      ) : (ubicaciones ?? []).length === 0 ? (
        // Sin un destino fijo no hay descarga posible, y un selector vacío no
        // lo explica. Se dice qué falta y se ofrece resolverlo acá mismo: el
        // repartidor no tiene por qué saber que existe una pantalla de
        // ubicaciones de inventario.
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs leading-relaxed text-amber-900">
            Todavía no hay ningún depósito donde bajar la mercadería. El camión tiene su propia
            ubicación, pero no sirve de destino: la mercadería que baja tiene que quedar en algún
            lado.
          </p>
          <button
            type="button"
            onClick={crearDeposito}
            disabled={creandoDeposito}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {creandoDeposito ? "Creando…" : "Crear el depósito"}
          </button>
          <p className="mt-1.5 text-[11px] text-amber-800/80">
            Después podés renombrarlo o agregar más en Inventario → Ubicaciones.
          </p>
        </div>
      ) : (ubicaciones ?? []).length === 1 ? (
        <p className="mb-3 text-xs text-slate-600">
          Va a <span className="font-semibold text-slate-900">{ubicaciones![0].nombre}</span>.
        </p>
      ) : (
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

      {esCarga && conSugerencia.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#4FAEB2]/30 bg-[#4FAEB2]/5 p-3">
          <p className="text-xs leading-relaxed text-slate-600">
            {conSugerencia.length}{" "}
            {conSugerencia.length === 1 ? "producto está" : "productos están"} por debajo del
            objetivo del camión {reparto.camion}.
          </p>
          <button
            type="button"
            onClick={usarSugerido}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-[#3F8E91] hover:bg-white"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Usar carga sugerida
          </button>
        </div>
      ) : null}

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
            const obj = porObjetivo.get(p.id);
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
                    {esCarga && obj?.objetivo !== null && obj?.objetivo !== undefined ? (
                      <>
                        {" · Objetivo "}
                        {obj.objetivo}
                        {obj.sugerido > 0 ? (
                          <span className="font-semibold text-[#3F8E91]">
                            {" · faltan "}
                            {obj.sugerido}
                          </span>
                        ) : (
                          <span className="text-emerald-600"> · completo</span>
                        )}
                      </>
                    ) : null}
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
