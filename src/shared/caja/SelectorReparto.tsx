"use client";

import { AlertTriangle, Truck } from "lucide-react";
import type { CajaVenta } from "@/shared/caja/useCajaVenta";

/** Hoy en Paraguay, como `YYYY-MM-DD`, sin depender del huso del navegador. */
function hoyPy(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
}

/** "14/04" para mostrar la fecha del reparto sin ocupar media línea. */
function fechaCorta(ymd: string): string {
  const [, m, d] = ymd.slice(0, 10).split("-");
  return d && m ? `${d}/${m}` : ymd;
}

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
        <>
          <p className="text-sm text-slate-900">
            Camión <span className="font-semibold">{caja.repartosAbiertos[0].camion}</span>
            {caja.repartosAbiertos[0].repartidor ? (
              <span className="text-slate-500"> · {caja.repartosAbiertos[0].repartidor}</span>
            ) : null}
            <span className="text-slate-500">
              {" "}
              · {fechaCorta(caja.repartosAbiertos[0].fecha)}
            </span>
          </p>
          {/* Un reparto abierto de otro día es uno que nadie cerró. La venta de
              hoy se le suma a esa jornada y el cierre de ayer sale mal. */}
          {caja.repartosAbiertos[0].fecha.slice(0, 10) !== hoyPy() ? (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-900">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Este reparto es del {fechaCorta(caja.repartosAbiertos[0].fecha)} y sigue abierto.
                Lo que vendas ahora se suma a esa jornada. Cerralo desde Repartos y abrí el de hoy.
              </span>
            </p>
          ) : null}
        </>
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
                  <span className="block text-[11px] font-normal text-slate-500">
                    {r.repartidor ? `${r.repartidor} · ` : ""}
                    {fechaCorta(r.fecha)}
                    {r.fecha.slice(0, 10) !== hoyPy() ? " · sin cerrar" : ""}
                  </span>
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
