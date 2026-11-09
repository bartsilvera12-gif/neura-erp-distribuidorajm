"use client";

import Link from "next/link";
import { useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { useArqueo } from "@/shared/hooks/useArqueo";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import PlanillaArqueo from "@/shared/caja/PlanillaArqueo";
import TarjetaCajaAbierta from "@/shared/caja/TarjetaCajaAbierta";
import { useSoloCaja } from "@/shared/hooks/useSoloCaja";
import { AvisoSinCajas, fechaLarga, hoyEnAsuncion, TEAL } from "@/shared/caja/arqueo-ui";
import ResumenArqueoRango from "@/shared/caja/ResumenArqueoRango";

/** Arqueo de caja desktop: las cajas del día en grilla, o resumen de un rango. */
export default function ArqueoDesktop() {
  const soloCaja = useSoloCaja();
  // Rango desde/hasta. Si son iguales, la pantalla queda tal cual antes (una
  // fecha). Si difieren, se muestra el resumen agregado del período. Pedido
  // explícito de la clienta (soporte, punto 6c).
  const hoy = hoyEnAsuncion();
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const fecha = desde; // compat: el flujo existente trabaja con una fecha.
  const esRango = desde !== hasta;
  // Lo normal es mirar la propia caja. La lista de todas las del día es para
  // revisar el negocio, no para vender, así que se pide a mano.
  // El administrador arranca viendo todas: su propia caja casi nunca tiene
  // ventas (las cobran los camioneros y el salón) y le salía todo en cero.
  const [elegido, setTodas] = useState<boolean | null>(null);
  const { isAdmin } = useIsAdmin();
  const todas = elegido ?? isAdmin;
  // El administrador, al mirar un día pasado, ve todas las cajas de ese día
  // (es revisión del negocio, no venta). Hoy sigue arrancando en su caja.
  const esHoy = fecha === hoy;
  const verTodas = todas || (isAdmin && !esHoy) || esRango;
  const { arqueo, isLoading, mutate } = useArqueo(fecha, verTodas);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Arqueo de caja</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {arqueo?.fecha ? fechaLarga(arqueo.fecha) : "Cargando…"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-slate-500">
            Desde
            <input
              type="date"
              value={desde}
              max={hasta || hoy}
              onChange={(e) => {
                const v = e.target.value;
                setDesde(v);
                if (hasta && v > hasta) setHasta(v);
              }}
              aria-label="Fecha desde"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-500">
            Hasta
            <input
              type="date"
              value={hasta}
              min={desde || undefined}
              max={hoy}
              onChange={(e) => setHasta(e.target.value)}
              aria-label="Fecha hasta"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            />
          </label>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!arqueo || arqueo.cajas.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
          <button
            type="button"
            onClick={() => mutate()}
            aria-label="Actualizar arqueo"
            className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-600 transition-colors hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          {soloCaja ? null : (
            <Link
              href="/camiones"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Camiones
            </Link>
          )}
          <Link
            href="/ventas/nueva"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: TEAL }}
          >
            Nueva venta
          </Link>
        </div>
      </header>

      {/* Abrir la caja, cargar movimientos (ingreso, egreso, ajuste) y cerrarla:
          acá, porque el cajero no entra a Ventas. */}
      <div className="mb-5">
        <TarjetaCajaAbierta onCambio={() => mutate()} />
      </div>


      {isAdmin && !esRango ? (
        esHoy ? (
          <button
            type="button"
            onClick={() => setTodas(!todas)}
            className="mb-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            {todas ? "Ver solo mi caja" : "Ver todas las cajas del día"}
          </button>
        ) : (
          <p className="mb-4 text-sm text-slate-500">Mostrando todas las cajas de este día.</p>
        )
      ) : null}

      {esRango ? (
        // Rango: se consultan los días en paralelo y se muestra el resumen
        // agregado por método de pago. La vista por caja individual queda
        // disponible al poner Desde=Hasta en una sola fecha.
        <ResumenArqueoRango desde={desde} hasta={hasta} />
      ) : isLoading && !arqueo ? (
        <p className="py-16 text-center text-sm text-slate-400">Cargando…</p>
      ) : arqueo && !arqueo.disponible ? (
        <AvisoSinCajas />
      ) : arqueo && arqueo.cajas.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-500">
          {verTodas
              ? "No hubo cajas abiertas este día."
              : (arqueo?.otras_cajas ?? 0) > 0
                ? `No tenés ninguna caja tuya este día, pero hay ${arqueo?.otras_cajas} caja(s) de otras personas. Si cobraste y no ves la plata acá, mirá «Ver todas las cajas del día»: puede haber quedado imputada a la caja de otro.`
                : "Todavía no tenés una caja abierta. Se abre sola al cobrar la primera venta."}
        </p>
      ) : (
        // Cada caja es su planilla de arqueo, como la hoja de papel de los
        // camioneros: se completa acá y se envía al administrador.
        <div className="space-y-6">
          {(arqueo?.cajas ?? []).map((c) => (
            <PlanillaArqueo key={c.id} cajaId={c.id} inline onGuardada={() => mutate()} />
          ))}
        </div>
      )}
    </div>
  );
}
