"use client";

import { LISTAS_PRECIO, DESCUENTO_MAYORISTA } from "@/lib/ventas/listas-precio";
import type { CajaVenta } from "@/shared/caja/useCajaVenta";

const TEAL = "#4FAEB2";

/**
 * Minorista / Mayorista. Cambia el precio de todo el carrito de una vez: los
 * productos que ya estaban cargados se recalculan, no hace falta sacarlos y
 * volverlos a poner.
 */
export default function SelectorListaPrecio({ caja }: { caja: CajaVenta }) {
  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Lista de precio"
        className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
      >
        {LISTAS_PRECIO.map((l) => {
          const activa = caja.lista === l.valor;
          return (
            <button
              key={l.valor}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => caja.setLista(l.valor)}
              className={`h-9 rounded-lg text-sm font-semibold transition-colors ${
                activa ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
              style={activa ? { color: TEAL } : undefined}
            >
              {l.etiqueta}
            </button>
          );
        })}
      </div>
      {caja.lista === "mayorista" ? (
        <p className="mt-1.5 text-xs text-slate-500">
          Precio de venta con {Math.round(DESCUENTO_MAYORISTA * 100)}% de descuento en todos los
          productos.
        </p>
      ) : null}
    </div>
  );
}
