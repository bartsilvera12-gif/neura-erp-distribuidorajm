"use client";

import { Info } from "lucide-react";

/** Piezas que comparten el cierre mobile y el desktop. */

/**
 * Lo que el mockup llama "control de mercadería" (stock inicial, devoluciones,
 * mercadería que regresa) no se puede calcular todavía: no existe la carga del
 * camión ni el registro de devoluciones. Decirlo es mejor que mostrar ceros,
 * que se leerían como "no hubo diferencias".
 */
export function AvisoMercaderia() {
  return (
    <div className="flex gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="text-xs leading-relaxed text-slate-600">
        <p className="font-semibold text-slate-700">Control de mercadería</p>
        <p className="mt-1">
          Faltan las tablas de repartos. Corré{" "}
          <code>supabase/distribuidorajm/06_repartos.sql</code> y vas a poder cargar el camión
          a la mañana y contar lo que vuelve a la tarde.
        </p>
      </div>
    </div>
  );
}

export function AvisoSinPagos() {
  return (
    <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
      Este schema no tiene tabla <code>pagos</code>, así que no hay cobranzas para mostrar.
      El resumen de ventas de arriba sí es correcto.
    </p>
  );
}
