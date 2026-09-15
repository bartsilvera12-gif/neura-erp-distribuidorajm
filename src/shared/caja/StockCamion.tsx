"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Package, RefreshCw, Truck } from "lucide-react";
import { useCamiones, useObjetivos } from "@/shared/hooks/useRepartos";
import { formatCantidad } from "@/lib/inventario/unidades";

const TEAL = "#4FAEB2";

/**
 * Qué hay arriba del camión, ahora mismo.
 *
 * El dato no sale de sumar cargas y restar ventas: es el saldo de la ubicación
 * del camión en `inventario_stock_ubicacion`, el mismo que descuenta cada venta
 * y el mismo contra el que se cuenta al cerrar el reparto. Un número solo, sin
 * dos fuentes que puedan diferir.
 *
 * Es de consulta: el vendedor lo mira en la calle para saber si le queda
 * mercadería. Cargar y transferir se hace desde Repartos.
 */
export default function StockCamion() {
  const { camiones, isLoading: cargandoCamiones } = useCamiones();
  const [camionId, setCamionId] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);

  // Con un solo camión no hay nada que elegir.
  const elegido = camionId ?? camiones[0]?.id ?? null;
  const { objetivos: items, isLoading: cargando, error, mutate } = useObjetivos(elegido);

  // Lo que interesa es lo que está arriba del camión. Un catálogo entero en
  // cero no le dice nada a quien está vendiendo.
  const visibles = useMemo(
    () => (verTodos ? items : items.filter((i) => i.actual > 0)),
    [items, verTodos]
  );

  const porUnidad = useMemo(() => {
    const acc = new Map<string, number>();
    for (const i of items) {
      if (i.actual <= 0) continue;
      acc.set(i.unidad || "—", (acc.get(i.unidad || "—") ?? 0) + i.actual);
    }
    return [...acc.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  return (
    <div className="mx-auto max-w-3xl p-4 pb-24 sm:p-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Stock del camión
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">Lo que hay arriba en este momento.</p>
        </div>
        <button
          type="button"
          onClick={() => mutate()}
          aria-label="Actualizar stock"
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
        </button>
      </header>

      {!cargandoCamiones && camiones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
          <Truck className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">
            Todavía no hay camiones cargados.
          </p>
          <Link
            href="/ventas/repartos"
            className="mt-3 inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: TEAL }}
          >
            Crear un camión
          </Link>
        </div>
      ) : null}

      {camiones.length > 1 ? (
        <select
          value={elegido ?? ""}
          onChange={(e) => setCamionId(e.target.value)}
          aria-label="Camión"
          className="mb-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
        >
          {camiones.map((c) => (
            <option key={c.id} value={c.id}>
              {c.alias}
            </option>
          ))}
        </select>
      ) : camiones.length === 1 ? (
        <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Truck className="h-4 w-4 text-slate-400" />
          {camiones[0].alias}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          No se pudo leer el stock del camión.
        </p>
      ) : null}

      {porUnidad.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {porUnidad.map(([unidad, total]) => (
            <span
              key={unidad}
              className="rounded-lg bg-[#0B3A3D] px-3 py-1.5 text-xs font-semibold text-white"
            >
              {formatCantidad(total, unidad)} {unidad}
            </span>
          ))}
        </div>
      ) : null}

      {cargando && items.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">Cargando…</p>
      ) : visibles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
          <Package className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">
            {items.length === 0
              ? "Este camión todavía no tiene ubicación de inventario."
              : "El camión está vacío."}
          </p>
          <Link
            href="/ventas/repartos"
            className="mt-3 inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: TEAL }}
          >
            Cargar el camión
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {visibles.map((i) => {
            // Con objetivo definido se ve de una si va corto para la ruta.
            const corto = i.objetivo !== null && i.actual < i.objetivo;
            return (
              <li
                key={i.producto_id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{i.nombre}</p>
                  {i.objetivo !== null ? (
                    <p className={`text-xs ${corto ? "text-amber-700" : "text-slate-500"}`}>
                      Objetivo {formatCantidad(i.objetivo, i.unidad)} {i.unidad}
                      {corto ? ` · faltan ${formatCantidad(i.sugerido, i.unidad)}` : " · completo"}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 text-right">
                  <span className="text-base font-bold tabular-nums text-slate-900">
                    {formatCantidad(i.actual, i.unidad)}
                  </span>{" "}
                  <span className="text-xs text-slate-400">{i.unidad}</span>
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {items.length > visibles.length || (!verTodos && items.length > 0) ? (
        <button
          type="button"
          onClick={() => setVerTodos((v) => !v)}
          className="mt-3 w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-600"
        >
          {verTodos ? "Ver solo lo que está arriba" : "Ver todos los productos"}
        </button>
      ) : null}

      <Link
        href="/ventas/repartos"
        className="mt-2 block w-full rounded-xl border border-slate-200 bg-white py-3 text-center text-sm font-medium text-slate-600"
      >
        Cargar o transferir mercadería
      </Link>
    </div>
  );
}
