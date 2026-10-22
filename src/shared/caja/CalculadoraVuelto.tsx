"use client";

import type { CajaVenta } from "@/shared/caja/useCajaVenta";

const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString("es-PY")}`;

/**
 * Montos con los que suele pagar la gente: el total redondeado hacia arriba al
 * próximo billete de 10.000, 50.000 y 100.000. Un toque y queda cargado.
 */
function sugeridos(total: number): number[] {
  const arriba = (paso: number) => Math.ceil((total + 1) / paso) * paso;
  return [...new Set([arriba(10_000), arriba(50_000), arriba(100_000)])].sort((a, b) => a - b);
}

/**
 * Cobro en efectivo: cuánto entrega el cliente y cuánto vuelto hay que darle.
 *
 * Es una ayuda para el cajero: la venta se registra por el total igual, y no
 * frena la confirmación si queda vacío.
 */
export default function CalculadoraVuelto({
  caja,
  grande = false,
  enfocar = false,
  inputId,
}: {
  caja: CajaVenta;
  grande?: boolean;
  /** Cursor en "Paga con" al abrir (escritorio: se escribe el monto y Enter). */
  enfocar?: boolean;
  inputId?: string;
}) {
  const total = caja.totales.total;
  const entrega = caja.pagaConNum;
  const vuelto = entrega - total;
  const opciones = sugeridos(total);
  // Grande: el monto se lee de lejos y los botones se tocan sin errar.
  const alto = grande ? "h-14 text-2xl" : "h-10 text-sm";
  const boton = grande
    ? "rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
    : "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100";
  const importe = grande ? "text-3xl" : "text-xl";

  function escribir(v: string) {
    const digitos = v.replace(/\D/g, "");
    caja.setPagaCon(digitos ? Number(digitos).toLocaleString("es-PY") : "");
  }

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">
          Paga con
        </span>
        <input
          id={inputId}
          autoFocus={enfocar}
          inputMode="numeric"
          value={caja.pagaCon}
          onChange={(e) => escribir(e.target.value)}
          placeholder="Lo que entrega el cliente"
          className={`w-full rounded-lg border border-slate-200 bg-white px-3 font-semibold tabular-nums outline-none focus:ring-2 focus:ring-[#4FAEB2] ${alto}`}
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => caja.setPagaCon(Math.round(total).toLocaleString("es-PY"))}
          className={boton}
        >
          Exacto
        </button>
        {opciones.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => caja.setPagaCon(b.toLocaleString("es-PY"))}
            className={boton}
          >
            {gs(b)}
          </button>
        ))}
      </div>
      {entrega > 0 ? (
        vuelto >= 0 ? (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
            <span className="text-sm font-semibold text-emerald-800">Vuelto</span>
            <span className={`${importe} font-bold tabular-nums text-emerald-800`}>{gs(vuelto)}</span>
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2">
            <span className="text-sm font-semibold text-amber-800">Falta</span>
            <span className={`${importe} font-bold tabular-nums text-amber-800`}>{gs(-vuelto)}</span>
          </div>
        )
      ) : null}
    </div>
  );
}
