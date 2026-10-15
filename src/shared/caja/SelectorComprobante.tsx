"use client";

import { FileText, Receipt } from "lucide-react";
import type { CajaVenta, DocumentoVenta } from "@/shared/caja/useCajaVenta";

/**
 * Qué papel sale al cobrar: factura A4 o ticket de rollo.
 *
 * Arranca solo según el cliente (con cliente factura, Sin nombre ticket),
 * pero se puede cambiar: hay clientes que piden ticket y ventas Sin nombre
 * que llevan factura.
 */
const OPCIONES: { valor: DocumentoVenta; etiqueta: string; Icono: typeof FileText }[] = [
  { valor: "factura", etiqueta: "Factura", Icono: FileText },
  { valor: "ticket", etiqueta: "Ticket", Icono: Receipt },
];

export default function SelectorComprobante({
  caja,
  grande = false,
}: {
  caja: CajaVenta;
  /** Botones más altos, para el celular. */
  grande?: boolean;
}) {
  const alto = grande ? "h-12 text-base" : "h-10 text-sm";
  return (
    <div role="radiogroup" aria-label="Comprobante" className="grid grid-cols-2 gap-2">
      {OPCIONES.map(({ valor, etiqueta, Icono }) => {
        const elegido = caja.documento === valor;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={elegido}
            onClick={() => caja.setDocumento(valor)}
            className={`flex items-center justify-center gap-2 rounded-xl border-2 font-medium transition-colors ${alto} ${
              elegido
                ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-slate-900"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icono className="h-4 w-4" />
            {etiqueta}
          </button>
        );
      })}
    </div>
  );
}
