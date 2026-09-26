"use client";

import Link from "next/link";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useArqueo } from "@/shared/hooks/useArqueo";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import TarjetaArqueo from "@/shared/caja/TarjetaArqueo";
import TablaArqueo from "@/shared/caja/TablaArqueo";
import AperturaCaja from "@/shared/caja/AperturaCaja";
import { useCajaAbierta } from "@/shared/hooks/useCajaAbierta";
import { AvisoSinCajas, fechaLarga, hoyEnAsuncion, TEAL } from "@/shared/caja/arqueo-ui";

/** Arqueo de caja desktop: las cajas del día en grilla. */
export default function ArqueoDesktop() {
  const [fecha, setFecha] = useState(hoyEnAsuncion());
  // Lo normal es mirar la propia caja. La lista de todas las del día es para
  // revisar el negocio, no para vender, así que se pide a mano.
  const [todas, setTodas] = useState(false);
  const { isAdmin } = useIsAdmin();
  const { arqueo, isLoading, mutate } = useArqueo(fecha, todas);
  // Abrir y cerrar la caja se hace acá: es la pantalla donde se mira el cuadre.
  const { caja: cajaAbierta, mutate: recargarCaja } = useCajaAbierta();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Arqueo de caja</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {arqueo?.fecha ? fechaLarga(arqueo.fecha) : "Cargando…"}
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
            href="/ventas/cierre"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Cierre de reparto
          </Link>
          <Link
            href="/ventas/nueva"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: TEAL }}
          >
            Nueva venta
          </Link>
        </div>
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


      {isAdmin ? (
        <button
          type="button"
          onClick={() => setTodas((v) => !v)}
          className="mb-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          {todas ? "Ver solo mi caja" : "Ver todas las cajas del día"}
        </button>
      ) : null}

      {isLoading && !arqueo ? (
        <p className="py-16 text-center text-sm text-slate-400">Cargando…</p>
      ) : arqueo && !arqueo.disponible ? (
        <AvisoSinCajas />
      ) : arqueo && arqueo.cajas.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-500">
          {todas
              ? "No hubo cajas abiertas este día."
              : (arqueo?.otras_cajas ?? 0) > 0
                ? `No tenés ninguna caja tuya este día, pero hay ${arqueo?.otras_cajas} caja(s) de otras personas. Si cobraste y no ves la plata acá, mirá «Ver todas las cajas del día»: puede haber quedado imputada a la caja de otro.`
                : "Todavía no tenés una caja abierta. Se abre sola al cobrar la primera venta."}
        </p>
      ) : (
        <div className="space-y-4">
          <TablaArqueo cajas={arqueo?.cajas ?? []} credito={arqueo?.credito} />
          <div className="grid gap-4 lg:grid-cols-2">
            {(arqueo?.cajas ?? []).map((c) => (
              <TarjetaArqueo key={c.id} caja={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
