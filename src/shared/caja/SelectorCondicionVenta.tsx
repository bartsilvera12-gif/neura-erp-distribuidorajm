"use client";

import type { CajaVenta } from "@/shared/caja/useCajaVenta";

/**
 * Contado o crédito: lo primero que se decide al cobrar.
 *
 * Dos botones y no una casilla "venta a crédito": son las dos formas de
 * cerrar una venta y tienen que verse las dos. El crédito necesita un cliente
 * identificado —a alguien sin nombre no se le puede fiar—, así que sin cliente
 * queda apagado y dice por qué.
 */
export default function SelectorCondicionVenta({
  caja,
  grande = false,
}: {
  caja: CajaVenta;
  /** Botones más altos, para el celular. */
  grande?: boolean;
}) {
  const alto = grande ? "h-14 text-base" : "h-11 text-sm";
  return (
    <div>
      <div role="radiogroup" aria-label="Condición de la venta" className="grid grid-cols-2 gap-2">
        <button
          type="button"
          role="radio"
          aria-checked={!caja.aCredito}
          onClick={() => caja.setACredito(false)}
          className={`flex items-center justify-center gap-2 rounded-xl border-2 font-semibold transition-colors ${alto} ${
            !caja.aCredito
              ? "border-emerald-500 bg-emerald-50 text-emerald-800"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Contado
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={caja.aCredito}
          disabled={!caja.creditoDisponible}
          onClick={() => caja.setACredito(true)}
          className={`flex items-center justify-center gap-2 rounded-xl border-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${alto} ${
            caja.aCredito
              ? "border-amber-400 bg-amber-50 text-amber-800"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          Crédito
        </button>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        {!caja.creditoDisponible
          ? "El crédito es solo para clientes identificados."
          : caja.aCredito
            ? "Se cobra después: no entra plata a la caja ahora."
            : "Se cobra ahora."}
      </p>
    </div>
  );
}
