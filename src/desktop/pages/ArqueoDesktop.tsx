"use client";

import Link from "next/link";
import { useState } from "react";
import { HelpCircle, RefreshCw } from "lucide-react";
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
 * Arqueo de caja desktop. Misma API que la mobile, layout de escritorio:
 * el desglose como tabla —que es como se lee un cierre— y los totales en
 * tarjetas al costado.
 */
export default function ArqueoDesktop() {
  const [fecha, setFecha] = useState(hoyEnAsuncion());
  const { arqueo, isLoading, mutate } = useArqueo(fecha);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Arqueo de caja</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {arqueo ? fechaLarga(arqueo.fecha) : "Cargando…"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fecha}
            max={hoyEnAsuncion()}
            onChange={(e) => setFecha(e.target.value)}
            aria-label="Fecha del arqueo"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          />
          <button
            type="button"
            onClick={() => mutate()}
            aria-label="Actualizar arqueo"
            className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-600 transition-colors hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/ventas/nueva"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: TEAL }}
          >
            Nueva venta
          </Link>
        </div>
      </header>

      {arqueo && !arqueo.tiene_forma_pago ? (
        <div className="mb-4">
          <AvisoSinColumna />
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Forma de pago
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Cantidad
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {(arqueo?.lineas ?? []).map((l) => {
                const Icono = ICONOS_PAGO[l.forma_pago];
                const vacia = l.cantidad === 0;
                return (
                  <tr key={l.forma_pago} className="border-b border-slate-50 last:border-b-0">
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-2.5">
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                            vacia ? "bg-slate-50 text-slate-300" : "bg-[#4FAEB2]/10 text-[#4FAEB2]"
                          }`}
                        >
                          <Icono className="h-4 w-4" />
                        </span>
                        <span
                          className={`text-sm font-medium ${vacia ? "text-slate-400" : "text-slate-900"}`}
                        >
                          {l.label}
                        </span>
                      </span>
                    </td>
                    <td
                      className={`px-5 py-3.5 text-right text-sm tabular-nums ${
                        vacia ? "text-slate-300" : "text-slate-600"
                      }`}
                    >
                      {l.cantidad}
                    </td>
                    <td
                      className={`px-5 py-3.5 text-right text-sm font-semibold tabular-nums ${
                        vacia ? "text-slate-300" : "text-slate-900"
                      }`}
                    >
                      {formatGs(l.total)}
                    </td>
                  </tr>
                );
              })}

              {arqueo && arqueo.sin_clasificar.cantidad > 0 ? (
                <tr className="border-t border-slate-100 bg-slate-50/40">
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                        <HelpCircle className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-medium text-slate-600">
                        {SIN_REGISTRAR_LABEL}
                      </span>
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm tabular-nums text-slate-600">
                    {arqueo.sin_clasificar.cantidad}
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm font-semibold tabular-nums text-slate-600">
                    {formatGs(arqueo.sin_clasificar.total)}
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-100 bg-slate-50/60">
                <td className="px-5 py-4 text-sm font-bold text-slate-900">Total del día</td>
                <td className="px-5 py-4 text-right text-sm font-bold tabular-nums text-slate-900">
                  {arqueo?.totales.cantidad ?? 0}
                </td>
                <td className="px-5 py-4 text-right text-lg font-bold tabular-nums text-slate-900">
                  {arqueo ? formatGs(arqueo.totales.total) : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-[#4FAEB2]/5 p-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Total del día
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
              {arqueo ? formatGs(arqueo.totales.total) : "—"}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {arqueo
                ? `${arqueo.totales.cantidad} ${arqueo.totales.cantidad === 1 ? "venta" : "ventas"}`
                : ""}
            </p>
          </div>

          {/* Lo cobrado hoy no es lo mismo que lo vendido hoy: el crédito entra
              en el total de ventas pero todavía no en la caja. */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-slate-500">Cobrado (contado)</span>
              <span className="text-sm font-semibold tabular-nums text-slate-900">
                {arqueo ? formatGs(arqueo.totales.contado) : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-slate-500">A cobrar (crédito)</span>
              <span className="text-sm font-semibold tabular-nums text-slate-900">
                {arqueo ? formatGs(arqueo.totales.credito) : "—"}
              </span>
            </div>
          </div>

        </aside>
      </div>
    </div>
  );
}
