"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Ventana sobre la caja para "¡Venta registrada!" y la factura: la caja sigue
 * de fondo, ya limpia para la venta siguiente.
 *
 * Va por portal al <body> para que al imprimir se pueda dejar solo la ventana
 * en el papel (globals.css): dentro del layout, la caja escondida seguía
 * ocupando lugar y sumaba hojas en blanco.
 */
export default function ModalComprobante({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  // Solo se abre después de cobrar, siempre en el navegador.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="modal-comprobante fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 p-4"
    >
      <div className="flex min-h-full items-start justify-center py-6">
        {children}
      </div>
    </div>,
    document.body,
  );
}
