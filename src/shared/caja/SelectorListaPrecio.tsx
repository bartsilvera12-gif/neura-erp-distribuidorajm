"use client";

import { useEffect, useState } from "react";
import { LISTAS_PRECIO, DESCUENTO_MAYORISTA } from "@/lib/ventas/listas-precio";
import type { CajaVenta } from "@/shared/caja/useCajaVenta";

const TEAL = "#4FAEB2";

/**
 * Minorista / Mayorista. Cambia el precio de todo el carrito de una vez: los
 * productos que ya estaban cargados se recalculan, no hace falta sacarlos y
 * volverlos a poner.
 */
export default function SelectorListaPrecio({ caja }: { caja: CajaVenta }) {
  // Doble render para evitar un hydration mismatch:
  // - En SSR y en el PRIMER render del cliente, `caja.listaFija` es false
  //   porque SWR todavía no tiene los datos del catálogo. Renderizar el
  //   <p> en ese primer render client cuando SWR ya cargó por cache daba
  //   "Hydration failed because the server rendered HTML didn't match the
  //   client". El error dejaba a /ventas/nueva con el árbol regenerado en
  //   el cliente y `useCatalogoVenta` quedaba en isLoading=true, lo que
  //   escondía todo el catálogo y el aviso de origen.
  // - Después de montar, ya se puede usar el valor real de listaFija.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // La lista es la del camión o la del salón: se elige en la compra.
  if (mounted && caja.listaFija) {
    return (
      <p className="text-sm text-slate-600">
        <span className="font-semibold" style={{ color: TEAL }}>
          {caja.lista === "mayorista" ? "Mayorista" : "Minorista"}
        </span>{" "}
        <span className="text-xs text-slate-400">(se elige en Compras)</span>
      </p>
    );
  }
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
