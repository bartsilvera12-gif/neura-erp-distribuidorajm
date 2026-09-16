"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useArqueo } from "@/shared/hooks/useArqueo";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import TarjetaArqueo from "@/shared/caja/TarjetaArqueo";
import TablaArqueo from "@/shared/caja/TablaArqueo";
import { useRepartos } from "@/shared/hooks/useRepartos";
import AperturaCaja from "@/shared/caja/AperturaCaja";
import { useCajaAbierta } from "@/shared/hooks/useCajaAbierta";
import { AvisoSinCajas, fechaLarga, hoyEnAsuncion, TEAL } from "@/shared/caja/arqueo-ui";

/** Arqueo de caja mobile: una tarjeta por caja del día. */
export default function ArqueoMobile() {
  const [fecha, setFecha] = useState(hoyEnAsuncion());
  // Lo normal es mirar la propia caja. La lista de todas las del día es para
  // revisar el negocio, no para vender, así que se pide a mano.
  const [todas, setTodas] = useState(false);
  const { isAdmin } = useIsAdmin();
  // El camión de la jornada va en la cabecera: el arqueo es de una ruta, no de
  // un mostrador, y saber de qué camión se está hablando es media lectura.
  const { repartos } = useRepartos({ abiertos: true });
  const camion = repartos[0]?.camion ?? null;
  const { arqueo, isLoading, mutate } = useArqueo(fecha, todas);
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
        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          <p className="text-white/70">{arqueo?.fecha ? fechaLarga(arqueo.fecha) : ""}</p>
          {camion ? <p className="shrink-0 font-semibold text-white">Camión: {camion}</p> : null}
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


      <div className="space-y-3 px-4 pt-4">
        {isLoading && !arqueo ? (
          <p className="py-10 text-center text-sm text-slate-400">Cargando…</p>
        ) : arqueo && !arqueo.disponible ? (
          <AvisoSinCajas />
        ) : arqueo && arqueo.cajas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            {todas ? "No hubo cajas abiertas este día." : "Todavía no tenés una caja abierta. Se abre sola al cobrar la primera venta."}
          </p>
        ) : (
          <>
            {/* Lo cobrado por forma de pago, que es como lo leían en papel. */}
            <TablaArqueo cajas={arqueo?.cajas ?? []} credito={arqueo?.credito} />
            {/* Debajo, el control del cajón: apertura, salidas y esperado. */}
            {(arqueo?.cajas ?? []).map((c) => (
              <TarjetaArqueo key={c.id} caja={c} />
            ))}
          </>
        )}

        {isAdmin ? (
          <button
            type="button"
            onClick={() => setTodas((v) => !v)}
            className="block w-full rounded-xl border border-slate-200 bg-white py-3 text-center text-sm font-medium text-slate-600"
          >
            {todas ? "Ver solo mi caja" : "Ver todas las cajas del día"}
          </button>
        ) : null}

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
