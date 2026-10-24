"use client";

import { useState } from "react";
import useSWR from "swr";
import { Package, Pencil, Plus, Trash2 } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import MontoInput from "@/components/ui/MontoInput";
import type { Empaque } from "@/lib/inventario/types";

const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString("es-PY")}`;
const INPUT =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900";

type Borrador = { id: string | null; nombre: string; factor: string; precio: number; codigo: string };
const VACIO: Borrador = { id: null, nombre: "", factor: "", precio: 0, codigo: "" };

/**
 * Cajas y paquetes del producto: «Caja x12» con su precio y su código de
 * barras. El stock sigue en unidades; vender o comprar una caja mueve las
 * unidades que trae. Se guarda al toque, aparte del formulario del producto.
 */
export default function EmpaquesProducto({
  productoId,
  precioUnidad,
  stockUnidades,
}: {
  productoId: string;
  precioUnidad: number;
  stockUnidades: number;
}) {
  const url = `/api/productos/${productoId}/empaques`;
  const { data, error, mutate } = useSWR<{ disponible: boolean; empaques: Empaque[] }>(url, async () => {
    const res = await fetchWithSupabaseSession(url, { cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as { data?: { disponible: boolean; empaques: Empaque[] }; error?: string };
    if (!res.ok || !j.data) throw new Error(j.error ?? "No se pudieron leer las cajas.");
    return j.data;
  });
  const [b, setB] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const factor = Number(b?.factor || 0);
  const precioSugerido = factor > 1 ? Math.round(precioUnidad * factor) : 0;

  async function guardar() {
    if (!b) return;
    if (!(factor > 1) || !Number.isInteger(factor)) return setAviso("Poné cuántas unidades trae (un número mayor que 1).");
    setGuardando(true);
    setAviso(null);
    try {
      const res = await fetchWithSupabaseSession(b.id ? `${url}/${b.id}` : url, {
        method: b.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: b.nombre.trim() || `Caja x${factor}`,
          factor,
          precio_venta: b.precio > 0 ? b.precio : null,
          codigo_barras: b.codigo.trim() || null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "No se pudo guardar la caja.");
      setB(null);
      void mutate();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo guardar la caja.");
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(e: Empaque) {
    if (!window.confirm(`¿Quitar «${e.nombre}»? Las ventas hechas con esa caja no cambian.`)) return;
    const res = await fetchWithSupabaseSession(`${url}/${e.id}`, { method: "DELETE" });
    if (!res.ok) setAviso("No se pudo quitar la caja.");
    void mutate();
  }

  const empaques = data?.empaques ?? [];

  return (
    <div className="border-t border-slate-100 pt-6">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cajas y paquetes</p>
        <span className="text-xs text-gray-400">Opcional</span>
      </div>
      <p className="mb-3 text-xs text-gray-500">
        Si este producto viene también en caja (por ejemplo, caja de 12 leches), cargala acá. El stock se lleva en
        unidades: vender o comprar 1 caja mueve las unidades que trae.
      </p>

      {error ? (
        <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{(error as Error).message}</p>
      ) : data && !data.disponible ? (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Falta correr el SQL 57 (cajas de productos).</p>
      ) : (
        <>
          {empaques.length > 0 ? (
            <ul className="mb-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {empaques.map((e) => {
                const precio = e.precio_venta ?? Math.round(precioUnidad * e.factor);
                const cajas = Math.floor(stockUnidades / e.factor);
                const sueltas = stockUnidades - cajas * e.factor;
                return (
                  <li key={e.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <Package className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800">
                        {e.nombre} <span className="font-normal text-slate-500">· {e.factor} unidades</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {gs(precio)}
                        {e.precio_venta === null ? " (unidades × precio)" : ""}
                        {e.codigo_barras ? ` · código ${e.codigo_barras}` : ""}
                        {` · en stock: ${cajas} ${cajas === 1 ? "caja" : "cajas"}${sueltas > 0 ? ` + ${sueltas} u.` : ""}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setB({
                          id: e.id,
                          nombre: e.nombre,
                          factor: String(e.factor),
                          precio: e.precio_venta ?? 0,
                          codigo: e.codigo_barras ?? "",
                        })
                      }
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                      aria-label={`Editar ${e.nombre}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void quitar(e)}
                      className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                      aria-label={`Quitar ${e.nombre}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {b ? (
            <div
              className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
              // Está dentro del formulario del producto: Enter guarda la caja, no el producto.
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void guardar();
                }
              }}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">Unidades que trae</span>
                  <input
                    inputMode="numeric"
                    value={b.factor}
                    onChange={(e) => setB({ ...b, factor: e.target.value.replace(/\D/g, "") })}
                    placeholder="12"
                    className={INPUT}
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">Nombre</span>
                  <input
                    value={b.nombre}
                    onChange={(e) => setB({ ...b, nombre: e.target.value })}
                    placeholder={factor > 1 ? `Caja x${factor}` : "Caja x12"}
                    className={INPUT}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">Precio de la caja</span>
                  <MontoInput
                    value={b.precio}
                    onChange={(n) => setB({ ...b, precio: n })}
                    decimals={false}
                    placeholder={precioSugerido ? precioSugerido.toLocaleString("es-PY") : "0"}
                    className={INPUT}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">Código de barras</span>
                  <input
                    value={b.codigo}
                    onChange={(e) => setB({ ...b, codigo: e.target.value })}
                    placeholder="Opcional"
                    className={INPUT}
                    autoComplete="off"
                  />
                </label>
              </div>
              <p className="text-xs text-gray-500">
                {factor > 1
                  ? b.precio > 0
                    ? `Por unidad sale ${gs(b.precio / factor)} (suelta: ${gs(precioUnidad)}).`
                    : `Sin precio propio, la caja vale ${gs(precioSugerido)} (${factor} × ${gs(precioUnidad)}).`
                  : "Ej.: 12 unidades. El precio de la caja es opcional."}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void guardar()}
                  disabled={guardando}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
                >
                  {guardando ? "Guardando…" : b.id ? "Guardar caja" : "Agregar caja"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setB(null);
                    setAviso(null);
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setB(VACIO)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Plus className="h-4 w-4" />
              Agregar caja o paquete
            </button>
          )}
          {aviso ? <p className="mt-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{aviso}</p> : null}
        </>
      )}
    </div>
  );
}
