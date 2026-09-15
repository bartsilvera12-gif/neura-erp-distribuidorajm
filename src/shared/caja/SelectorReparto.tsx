"use client";

import { Truck } from "lucide-react";
import type { CajaVenta } from "@/shared/caja/useCajaVenta";

/**
 * De qué camión sale la mercadería de esta venta.
 *
 * - Sin repartos abiertos no aparece: es una venta de mostrador.
 * - Con uno solo, se muestra como dato y no como pregunta: no hay nada que elegir.
 * - Con varios hay que elegir, porque adivinar descuadraría el control de
 *   mercadería del otro camión.
 */
export default function SelectorReparto({ caja }: { caja: CajaVenta }) {
  if (caja.repartosAbiertos.length === 0) return null;

  const unico = caja.repartosAbiertos.length === 1;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <Truck className="h-3.5 w-3.5" />
        Reparto
      </p>

      {unico ? (
        <p className="text-sm text-slate-900">
          Camión <span className="font-semibold">{caja.repartosAbiertos[0].camion}</span>
          {caja.repartosAbiertos[0].responsable ? (
            <span className="text-slate-500"> · {caja.repartosAbiertos[0].responsable}</span>
          ) : null}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {caja.repartosAbiertos.map((r) => {
              const elegido = caja.repartoId === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => caja.setRepartoId(r.id)}
                  className={`rounded-lg border-2 px-3 py-2 text-xs font-medium transition-colors ${
                    elegido
                      ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-slate-900"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Camión {r.camion}
                  {r.responsable ? (
                    <span className="block text-[11px] font-normal text-slate-500">
                      {r.responsable}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {caja.faltaElegirReparto ? (
            <p className="mt-2 text-xs text-amber-700">
              Hay {caja.repartosAbiertos.length} camiones en la calle: elegí de cuál sale.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
