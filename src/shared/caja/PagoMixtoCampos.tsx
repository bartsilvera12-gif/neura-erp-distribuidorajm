"use client";

import MontoInput from "@/components/ui/MontoInput";
import { formatGs, type CajaVenta } from "@/shared/caja/useCajaVenta";
import { MEDIOS_MIXTO } from "@/lib/ventas/types";

/**
 * Pago mixto: cuánto entrega el cliente en efectivo, por transferencia y en
 * cheque. «Resto» completa ese medio con lo que falta. Tiene que sumar lo que
 * se cobra; cada parte entra a la caja con su medio.
 */
export default function PagoMixtoCampos({ caja, grande = false }: { caja: CajaVenta; grande?: boolean }) {
  const alto = grande ? "h-12 text-lg" : "h-10 text-base";
  const falta = caja.faltaMixto;
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="space-y-2">
        {MEDIOS_MIXTO.map((m, i) => (
          <div key={m.value} className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-sm font-medium text-slate-700">{m.label}</span>
            <MontoInput
              id={i === 0 ? "cobro-mixto-0" : undefined}
              value={caja.mixto[m.value]}
              onChange={(v) => caja.setMixto(m.value, v)}
              decimals={false}
              placeholder="0"
              aria-label={`Pago mixto: ${m.label}`}
              className={`${alto} min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-right font-semibold tabular-nums outline-none focus:ring-2 focus:ring-[#4FAEB2]`}
            />
            <button
              type="button"
              tabIndex={-1}
              disabled={falta <= 0}
              onClick={() => caja.setMixto(m.value, caja.mixto[m.value] + falta)}
              title="Completar con lo que falta"
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              Resto
            </button>
          </div>
        ))}
      </div>
      <div
        className={`mt-3 flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${
          Math.abs(falta) <= 1
            ? "bg-emerald-50 text-emerald-700"
            : falta > 0
              ? "bg-amber-50 text-amber-800"
              : "bg-red-50 text-red-700"
        }`}
      >
        <span>
          {Math.abs(falta) <= 1 ? "Cuadra" : falta > 0 ? "Falta" : "Se pasa por"}
          <span className="ml-1 font-normal opacity-80">
            ({formatGs(caja.sumaMixto)} de {formatGs(caja.aCobrar)})
          </span>
        </span>
        <span className="tabular-nums">{Math.abs(falta) <= 1 ? "✓" : formatGs(Math.abs(falta))}</span>
      </div>
    </div>
  );
}
