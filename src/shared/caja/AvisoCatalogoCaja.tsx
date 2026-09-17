"use client";

import { Info } from "lucide-react";

/**
 * De dónde sale la lista de productos de la caja.
 *
 * La caja no muestra el catálogo entero y hay dos motivos distintos, los dos
 * invisibles hasta ahora: la venta sale de donde está parado el que vende —el
 * repartidor de su camión, el mostrador del salón—, y en cualquier caso un
 * producto sin stock no se ofrece. El resultado era una lista más corta que el
 * inventario sin nada que lo explicara, que se lee como que faltan productos.
 */
export default function AvisoCatalogoCaja({
  camion,
  ocultos,
}: {
  /** Nombre del camión cuando la venta sale de un reparto. */
  camion: string | null;
  /** Productos que existen pero no se ofrecen por no tener stock. */
  ocultos: number;
}) {
  if (!camion && ocultos === 0) return null;

  const sinStock =
    ocultos === 0
      ? ""
      : ` ${ocultos} ${ocultos === 1 ? "producto sin stock no se lista" : "productos sin stock no se listan"}.`;

  return (
    <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
      <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span>
        {camion ? (
          <>
            Solo lo que hay arriba del camión{" "}
            <span className="font-semibold text-slate-700">{camion}</span>.
          </>
        ) : (
          "Lo que hay en el salón: el stock de la empresa menos lo que está arriba de los camiones."
        )}
        {sinStock}
      </span>
    </p>
  );
}
