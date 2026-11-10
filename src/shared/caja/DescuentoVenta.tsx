"use client";

import { useState } from "react";
import { BadgePercent } from "lucide-react";
import { formatGs, type CajaVenta } from "@/shared/caja/useCajaVenta";

/**
 * Descuento sobre el total de la venta (por ejemplo 2% a un cliente que compra
 * por mayor). Se escribe en % o en guaraníes; la venta, la caja y el
 * comprobante quedan por lo que realmente se cobra.
 *
 * Arranca cerrado: la mayoría de las ventas no lleva descuento y no tiene que
 * ver un campo de más.
 */
export default function DescuentoVenta({
  caja,
  grande = false,
  onEnter,
}: {
  caja: CajaVenta;
  grande?: boolean;
  /** Enter en el campo: pasar a lo siguiente (la forma de pago). */
  onEnter?: () => void;
}) {
  const [abierto, setAbierto] = useState(caja.descuentoValor.trim() !== "");
  // El cursor va al campo solo cuando se toca «Aplicar descuento».
  const [enfocar, setEnfocar] = useState(false);
  const t = caja.totales;

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => {
          setAbierto(true);
          setEnfocar(true);
        }}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
      >
        <BadgePercent className="h-4 w-4" aria-hidden />
        Aplicar descuento
      </button>
    );
  }

  function escribir(v: string) {
    if (caja.descuentoTipo === "porcentaje") {
      // Hasta dos decimales: 2 o 2,5.
      const limpio = v.replace(/[^\d,]/g, "").replace(/,(?=.*,)/g, "");
      const [ent, dec] = limpio.split(",");
      caja.setDescuentoValor(dec !== undefined ? `${ent},${dec.slice(0, 2)}` : ent);
    } else {
      const digitos = v.replace(/\D/g, "");
      caja.setDescuentoValor(digitos ? Number(digitos).toLocaleString("es-PY") : "");
    }
  }

  const tipoBoton = (activo: boolean) =>
    `px-3 ${grande ? "py-2" : "py-1.5"} text-sm font-semibold ${
      activo ? "bg-[#4FAEB2] text-white" : "bg-white text-slate-600 hover:bg-slate-50"
    }`;

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Descuento</span>
        <button
          type="button"
          onClick={() => {
            caja.setDescuentoValor("");
            setAbierto(false);
          }}
          className="text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          Quitar
        </button>
      </div>
      <div className="mt-1.5 flex items-stretch gap-2">
        <div className="flex overflow-hidden rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => {
              caja.setDescuentoTipo("porcentaje");
              caja.setDescuentoValor("");
            }}
            className={tipoBoton(caja.descuentoTipo === "porcentaje")}
          >
            %
          </button>
          <button
            type="button"
            onClick={() => {
              caja.setDescuentoTipo("monto");
              caja.setDescuentoValor("");
            }}
            className={tipoBoton(caja.descuentoTipo === "monto")}
          >
            Gs.
          </button>
        </div>
        <input
          id="cobro-descuento"
          inputMode={caja.descuentoTipo === "porcentaje" ? "decimal" : "numeric"}
          autoFocus={enfocar}
          value={caja.descuentoValor}
          onChange={(e) => escribir(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && onEnter) {
              e.preventDefault();
              onEnter();
            }
          }}
          placeholder={caja.descuentoTipo === "porcentaje" ? "Ej. 2" : "Ej. 52.000"}
          aria-label={caja.descuentoTipo === "porcentaje" ? "Descuento en porcentaje" : "Descuento en guaraníes"}
          className={`min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 tabular-nums outline-none focus:ring-2 focus:ring-[#4FAEB2] ${
            grande ? "h-11 text-lg" : "h-9 text-sm"
          }`}
        />
      </div>
      {t.descuento > 0 ? (
        <div className="mt-2 space-y-0.5 text-sm tabular-nums">
          <p className="flex justify-between text-slate-500">
            <span>Total sin descuento</span>
            <span>{formatGs(t.subtotal)}</span>
          </p>
          <p className="flex justify-between text-slate-500">
            <span>Descuento {t.descuentoPorcentaje.toLocaleString("es-PY")}%</span>
            <span>−{formatGs(t.descuento)}</span>
          </p>
          <p className="flex justify-between font-semibold text-slate-900">
            <span>Total a cobrar</span>
            <span>{formatGs(t.total)}</span>
          </p>
        </div>
      ) : null}
      {t.descuentoError ? (
        <p role="alert" className="mt-2 text-xs font-medium text-rose-600">
          {t.descuentoError}
        </p>
      ) : null}
    </div>
  );
}
