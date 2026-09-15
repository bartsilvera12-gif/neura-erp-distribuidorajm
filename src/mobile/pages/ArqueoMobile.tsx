"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, HelpCircle, RefreshCw } from "lucide-react";
import { useArqueo } from "@/shared/hooks/useArqueo";
import { formatGs } from "@/shared/caja/useCajaVenta";
import {
  AvisoSinColumna,
  ICONOS_PAGO,
  SIN_REGISTRAR_LABEL,
  TEAL,
  fechaLarga,
  hoyEnAsuncion,
} from "@/shared/caja/arqueo-ui";

/**
 * Arqueo de caja mobile: cuánto entró hoy y por qué medio.
 *
 * Es la pantalla que se mira al cerrar el día, así que el total va grande y
 * arriba, y el desglose abajo. El selector de fecha permite revisar días
 * anteriores sin salir.
 */
export default function ArqueoMobile() {
  const [fecha, setFecha] = useState(hoyEnAsuncion());
  const { arqueo, isLoading, mutate } = useArqueo(fecha);

  return (
    <div className="min-h-full bg-[#F8FAFC] pb-8">
      <header className="bg-[var(--zentra-sidebar)] px-4 pb-5 pt-3 text-white">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/ventas"
              aria-label="Volver a Caja"
              className="-ml-1 rounded-lg p-1.5 active:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="truncate text-base font-semibold">Arqueo de caja</h1>
          </div>
          <button
            type="button"
            onClick={() => mutate()}
            aria-label="Actualizar arqueo"
            className="rounded-lg p-1.5 active:bg-white/10"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <input
          type="date"
          value={fecha}
          max={hoyEnAsuncion()}
          onChange={(e) => setFecha(e.target.value)}
          aria-label="Fecha del arqueo"
          className="mt-3 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white [color-scheme:dark]"
        />

        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wider text-white/60">Total del día</p>
          <p className="mt-0.5 text-3xl font-bold tabular-nums">
            {arqueo ? formatGs(arqueo.totales.total) : "—"}
          </p>
          <p className="mt-0.5 text-xs text-white/70">
            {arqueo
              ? `${arqueo.totales.cantidad} ${arqueo.totales.cantidad === 1 ? "venta" : "ventas"}`
              : "Cargando…"}
          </p>
        </div>
      </header>

      <div className="space-y-3 px-4 pt-4">
        {arqueo && !arqueo.tiene_forma_pago ? <AvisoSinColumna /> : null}

        <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {(arqueo?.lineas ?? []).map((l) => {
            const Icono = ICONOS_PAGO[l.forma_pago];
            const vacia = l.cantidad === 0;
            return (
              <li
                key={l.forma_pago}
                className="flex items-center gap-3 border-b border-slate-100 p-4 last:border-b-0"
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    vacia ? "bg-slate-50 text-slate-300" : "bg-[#4FAEB2]/10 text-[#4FAEB2]"
                  }`}
                >
                  <Icono className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm font-medium ${vacia ? "text-slate-400" : "text-slate-900"}`}
                  >
                    {l.label}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {l.cantidad} {l.cantidad === 1 ? "venta" : "ventas"}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-sm font-bold tabular-nums ${
                    vacia ? "text-slate-300" : "text-slate-900"
                  }`}
                >
                  {formatGs(l.total)}
                </span>
              </li>
            );
          })}

          {arqueo && arqueo.sin_clasificar.cantidad > 0 ? (
            <li className="flex items-center gap-3 border-t border-slate-100 bg-slate-50/60 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                <HelpCircle className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-600">
                  {SIN_REGISTRAR_LABEL}
                </span>
                <span className="block text-xs text-slate-400">
                  {arqueo.sin_clasificar.cantidad}{" "}
                  {arqueo.sin_clasificar.cantidad === 1 ? "venta" : "ventas"}
                </span>
              </span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-slate-600">
                {formatGs(arqueo.sin_clasificar.total)}
              </span>
            </li>
          ) : null}
        </ul>

        {/* Contado vs crédito: lo cobrado hoy no es lo mismo que lo vendido hoy. */}
        {arqueo ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between py-0.5">
              <span className="text-sm text-slate-500">Cobrado (contado)</span>
              <span className="text-sm font-semibold tabular-nums text-slate-900">
                {formatGs(arqueo.totales.contado)}
              </span>
            </div>
            <div className="flex items-center justify-between py-0.5">
              <span className="text-sm text-slate-500">A cobrar (crédito)</span>
              <span className="text-sm font-semibold tabular-nums text-slate-900">
                {formatGs(arqueo.totales.credito)}
              </span>
            </div>
          </div>
        ) : null}

        <p className="px-1 text-center text-[11px] leading-relaxed text-slate-400">
          {arqueo ? fechaLarga(arqueo.fecha) : ""}
        </p>

        <Link
          href="/ventas/nueva"
          className="block w-full rounded-xl py-3.5 text-center text-sm font-semibold text-white"
          style={{ backgroundColor: TEAL }}
        >
          Nueva venta
        </Link>
      </div>
    </div>
  );
}
