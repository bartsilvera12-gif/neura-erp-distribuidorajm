"use client";

import { useState } from "react";
import { FileText, Printer, Receipt, Share2 } from "lucide-react";
import FacturaA4 from "@/shared/caja/FacturaA4";
import HojaA4 from "@/shared/caja/HojaA4";
import ReciboVenta from "@/shared/caja/ReciboVenta";
import type { DatosComprobante } from "@/lib/ventas/comprobante";
import {
  compartirComprobante,
  whatsappComprobante,
} from "@/lib/ventas/compartir-comprobante";
import { comprobantePdf, nombreArchivoPdf } from "@/lib/ventas/comprobante-pdf";

/**
 * La factura como la ve el cliente: la hoja A4 (FacturaA4), igual en pantalla
 * que en el papel, las formas de hacérsela llegar (imprimir, compartir,
 * WhatsApp, PDF) y, si fue al contado, el recibo de dinero.
 *
 * Cuando no hay timbrado configurado el título dice COMPROBANTE DE VENTA y no
 * FACTURA. Un papel que dice "factura" sin timbrado no es una factura ante la
 * SET, y el que lo recibe no tiene cómo saberlo.
 */

const TINTA = "#0B3A3D";

export default function FacturaVenta({
  datos,
  telefonoCliente,
}: {
  datos: DatosComprobante;
  telefonoCliente?: string | null;
}) {
  const { venta } = datos;
  const [aviso, setAviso] = useState<string | null>(null);
  const [verRecibo, setVerRecibo] = useState(false);
  // Recibo de dinero: solo si la plata entró (contado) y la venta sigue viva.
  const conRecibo = venta.tipo_venta !== "CREDITO" && venta.estado !== "anulada";

  async function compartir() {
    setAviso(await compartirComprobante(datos));
  }

  function whatsapp() {
    whatsappComprobante(datos, telefonoCliente);
  }

  async function pdf() {
    setAviso(null);
    try {
      const blob = await comprobantePdf(datos);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreArchivoPdf(venta.numero_control);
      a.click();
      // Sin el respiro, Android cancela la descarga al revocar la URL.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setAviso("No se pudo generar el PDF. Probá con Imprimir.");
    }
  }

  if (verRecibo) {
    return (
      <div>
        <div className="no-imprimir flex justify-center pt-4">
          <button
            type="button"
            onClick={() => setVerRecibo(false)}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            ← Volver a la factura
          </button>
        </div>
        <ReciboVenta datos={datos} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[830px] px-4 py-5">
      {/* La misma hoja A4 que sale por la impresora, achicada al ancho de la
          pantalla. `factura-imprimible` es lo único que va al papel: el resto
          lo esconde @media print en globals.css. */}
      <div
        className={`no-imprimir mx-auto mb-4 grid gap-2 ${conRecibo ? "max-w-lg grid-cols-5" : "max-w-md grid-cols-4"}`}
      >
        <Accion label="Imprimir" onClick={() => window.print()}>
          <Printer className="h-5 w-5" />
        </Accion>
        <Accion label="Compartir" onClick={compartir}>
          <Share2 className="h-5 w-5" />
        </Accion>
        <Accion label="WhatsApp" onClick={whatsapp}>
          <IconoWhatsApp />
        </Accion>
        <Accion label="PDF" onClick={pdf}>
          <FileText className="h-5 w-5" />
        </Accion>
        {conRecibo ? (
          <Accion label="Recibo" onClick={() => setVerRecibo(true)}>
            <Receipt className="h-5 w-5" />
          </Accion>
        ) : null}
      </div>
      {aviso ? (
        <p
          role="status"
          className="no-imprimir mx-auto mb-3 max-w-md rounded-lg bg-slate-100 p-2.5 text-xs text-slate-600"
        >
          {aviso}
        </p>
      ) : null}

      <HojaA4>
        <div className="factura-imprimible">
          <FacturaA4 datos={datos} />
        </div>
      </HojaA4>
    </div>
  );
}

function Accion({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-medium text-slate-600 active:bg-slate-50"
    >
      <span style={{ color: TINTA }}>{children}</span>
      {label}
    </button>
  );
}

/** lucide no trae el logo de WhatsApp. */
function IconoWhatsApp() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.13h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.17 8.17 0 0 1-1.26-4.36c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.41a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.21-8.24 8.21Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.23-.17-.48-.29Z" />
    </svg>
  );
}
