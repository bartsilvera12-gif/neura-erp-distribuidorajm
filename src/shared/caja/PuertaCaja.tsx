"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AperturaCaja from "@/shared/caja/AperturaCaja";
import type { CajaVenta } from "@/shared/caja/useCajaVenta";

/**
 * Lo primero que aparece al entrar a una venta nueva cuando no hay caja abierta.
 *
 * Sin caja no se cobra de contado, y descubrirlo recién en el paso del pago es
 * tarde: el carrito ya está cargado. Acá se abre y se sigue.
 *
 * La caja NO se abre sola: el monto de apertura es el efectivo que hay en el
 * cajón, y es contra ese número que cuadra el arqueo. Abrirla en 0 por comodidad
 * haría que todos los cierres den diferencia.
 *
 * Tampoco bloquea: una venta a crédito no mueve plata hoy, así que se puede
 * seguir sin abrir.
 */
export default function PuertaCaja({
  caja,
  onOmitir,
}: {
  caja: CajaVenta;
  onOmitir: () => void;
}) {
  return (
    <div className="min-h-full bg-[#F8FAFC]">
      <header className="bg-[var(--zentra-sidebar)] px-4 pb-4 pt-3 text-white">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            aria-label="Volver al inicio"
            className="-ml-1 rounded-lg p-1.5 active:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="truncate text-base font-semibold">Nueva venta</h1>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-white/70">
          Antes de cobrar hay que abrir la caja con el efectivo que tenés en el cajón.
        </p>
      </header>

      <div className="mx-auto max-w-lg space-y-3 p-4">
        <AperturaCaja caja={null} onCambio={() => caja.recargarCaja()} />

        <button
          type="button"
          onClick={onOmitir}
          className="w-full rounded-xl border border-slate-200 bg-white py-3.5 text-sm font-medium text-slate-600 active:bg-slate-50"
        >
          Seguir sin abrir · solo venta a crédito
        </button>
      </div>
    </div>
  );
}
