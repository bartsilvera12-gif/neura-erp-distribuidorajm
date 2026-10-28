"use client";

import { X } from "lucide-react";
import ModalComprobante from "@/shared/caja/ModalComprobante";
import TicketVenta from "@/shared/caja/TicketVenta";
import { useEmisor } from "@/shared/hooks/useEmisor";
import { datosDeVenta } from "@/shared/ventas/DetalleVenta";
import type { Venta } from "@/lib/ventas/types";

/**
 * El ticket de una venta ya hecha, tal como sale en la impresora térmica:
 * se ve en pantalla y se vuelve a imprimir (el ticket trae su botón
 * «Imprimir» y el cambio de 80 a 58 mm) desde la lista de ventas.
 */
export default function ReimprimirTicket({ venta, onCerrar }: { venta: Venta; onCerrar: () => void }) {
  const { emisor } = useEmisor();
  return (
    <ModalComprobante>
      <div className="w-full max-w-md rounded-2xl bg-[#F8FAFC] px-4 pb-5 pt-2 shadow-xl print:max-w-none print:rounded-none print:bg-white print:p-0 print:shadow-none">
        <TicketVenta datos={datosDeVenta(venta, emisor)} />
        <button
          type="button"
          autoFocus
          onClick={onCerrar}
          className="no-imprimir flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <X className="h-4 w-4" />
          Cerrar
        </button>
      </div>
    </ModalComprobante>
  );
}
