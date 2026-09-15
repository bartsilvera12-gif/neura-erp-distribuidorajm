"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useArqueo } from "@/shared/hooks/useArqueo";
import TarjetaArqueo from "@/shared/caja/TarjetaArqueo";
import AperturaCaja from "@/shared/caja/AperturaCaja";
import { useCajaAbierta } from "@/shared/hooks/useCajaAbierta";
import { AvisoSinCajas, fechaLarga, hoyEnAsuncion, TEAL } from "@/shared/caja/arqueo-ui";

/** Arqueo de caja mobile: una tarjeta por caja del día. */
export default function ArqueoMobile() {
  const [fecha, setFecha] = useState(hoyEnAsuncion());
  const { arqueo, isLoading, mutate } = useArqueo(fecha);
  // Abrir y cerrar la caja se hace acá: es la pantalla donde se mira el cuadre.
  const { caja: cajaAbierta, mutate: recargarCaja } = useCajaAbierta();

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
        <p className="mt-2 text-xs text-white/70">{arqueo?.fecha ? fechaLarga(arqueo.fecha) : ""}</p>
      </header>

      <div className="mb-5">
        <AperturaCaja
          caja={cajaAbierta}
          onCambio={() => {
            recargarCaja();
            mutate();
          }}
        />
      </div>


      <div className="space-y-3 px-4 pt-4">
        {isLoading && !arqueo ? (
          <p className="py-10 text-center text-sm text-slate-400">Cargando…</p>
        ) : arqueo && !arqueo.disponible ? (
          <AvisoSinCajas />
        ) : arqueo && arqueo.cajas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            No hubo cajas abiertas este día.
          </p>
        ) : (
          (arqueo?.cajas ?? []).map((c) => <TarjetaArqueo key={c.id} caja={c} />)
        )}

        <Link
          href="/ventas/cierre"
          className="block w-full rounded-xl border border-slate-200 bg-white py-3.5 text-center text-sm font-medium text-slate-600"
        >
          Cierre de reparto
        </Link>
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
