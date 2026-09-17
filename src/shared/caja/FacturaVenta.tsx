"use client";

import { useState } from "react";
import { FileText, Printer, Share2 } from "lucide-react";
import { formatCantidad } from "@/lib/inventario/unidades";
import { esFacturaLegal, fechaHora, gs, type DatosComprobante } from "@/lib/ventas/comprobante";
import { compartirComprobante, whatsappComprobante } from "@/lib/ventas/compartir-comprobante";
import { comprobantePdf, nombreArchivoPdf } from "@/lib/ventas/comprobante-pdf";

/**
 * La factura como la ve el cliente: cabecera del emisor, detalle, total y las
 * cuatro formas de hacérsela llegar (imprimir, compartir, WhatsApp, PDF).
 *
 * Cuando no hay timbrado configurado el título dice COMPROBANTE DE VENTA y no
 * FACTURA. Un papel que dice "factura" sin timbrado no es una factura ante la
 * SET, y el que lo recibe no tiene cómo saberlo.
 */

const TINTA = "#0B3A3D";
const TEAL = "#4FAEB2";

export default function FacturaVenta({
  datos,
  telefonoCliente,
}: {
  datos: DatosComprobante;
  telefonoCliente?: string | null;
}) {
  const { venta, emisor } = datos;
  const { fecha, hora } = fechaHora(venta.fecha);
  const legal = esFacturaLegal(emisor);
  const [aviso, setAviso] = useState<string | null>(null);

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

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      {/* `factura-imprimible` es lo único que sale por la impresora: el resto de
          la pantalla lo esconde la regla @media print de globals.css. */}
      <article className="factura-imprimible rounded-2xl border border-slate-200 bg-white p-5">
        <header className="border-b border-slate-200 pb-3">
          <h2 className="text-lg font-black tracking-tight" style={{ color: TINTA }}>
            {emisor?.nombre_fantasia ?? emisor?.razon_social ?? "Distribuidora JM"}
          </h2>
          <div className="mt-0.5 space-y-0.5 text-[11px] text-slate-500">
            {emisor?.ruc ? <p>RUC: {emisor.ruc}</p> : null}
            {emisor?.direccion ? <p>{emisor.direccion}</p> : null}
            {emisor?.telefono ? <p>Tel.: {emisor.telefono}</p> : null}
          </div>
        </header>

        <div className="mt-3 flex items-start justify-between gap-3">
          <p className="text-base font-bold tracking-wide" style={{ color: TINTA }}>
            {legal ? "FACTURA" : "COMPROBANTE DE VENTA"}
          </p>
          <div className="text-right text-[11px] text-slate-600">
            {legal ? <p>Timbrado N.°: {emisor!.timbrado_numero}</p> : null}
            <p className="font-semibold text-slate-900">N.° {venta.numero_control}</p>
          </div>
        </div>

        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
          <Fila termino="Fecha" valor={fecha} />
          <Fila termino="Hora" valor={hora} />
          <div className="col-span-2">
            <Fila termino="Cliente" valor={datos.cliente} />
          </div>
        </dl>

        <table className="mt-3 w-full text-[11px]">
          <thead>
            <tr className="border-y border-slate-200 text-left text-slate-500">
              <th className="py-1.5 font-semibold">Descripción</th>
              <th className="py-1.5 text-right font-semibold">Cant.</th>
              <th className="py-1.5 text-right font-semibold">P. Unit.</th>
              <th className="py-1.5 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {venta.items.map((it) => {
              const u = datos.unidades?.[it.producto_id] ?? "";
              return (
                <tr key={it.producto_id} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-2 text-slate-800">{it.producto_nombre}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-700">
                    {formatCantidad(it.cantidad, u)}
                    {u ? <span className="text-slate-400"> {u}</span> : null}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-700">
                    {Math.round(it.precio_venta).toLocaleString("es-PY")}
                  </td>
                  <td className="py-1.5 text-right font-medium tabular-nums text-slate-900">
                    {Math.round(it.total_linea).toLocaleString("es-PY")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-2 space-y-0.5 text-[11px]">
          <div className="flex justify-between text-slate-500">
            <span>IVA incluido</span>
            <span className="tabular-nums">{gs(venta.monto_iva)}</span>
          </div>
          <div
            className="mt-1 flex items-center justify-between border-t border-slate-300 pt-1.5 text-sm font-bold"
            style={{ color: TINTA }}
          >
            <span>TOTAL A PAGAR</span>
            <span className="tabular-nums">{gs(venta.total)}</span>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-slate-600">
          Forma de pago: <span className="font-medium text-slate-900">{datos.formaPago}</span>
        </p>

        <footer className="mt-4 border-t border-slate-100 pt-3 text-center text-[11px]">
          <p className="font-semibold" style={{ color: TEAL }}>
            ¡Gracias por su compra!
          </p>
          {emisor?.leyenda ? <p className="mt-0.5 text-slate-500">{emisor.leyenda}</p> : null}
          {!legal ? (
            <p className="mt-2 text-[10px] leading-snug text-slate-400">
              Documento no fiscal. Para que salga como factura hay que cargar el RUC y el timbrado
              en Configuración → Facturación.
            </p>
          ) : null}
        </footer>
      </article>

      {aviso ? (
        <p role="status" className="mt-3 rounded-lg bg-slate-100 p-2.5 text-xs text-slate-600">
          {aviso}
        </p>
      ) : null}

      <div className="no-imprimir mt-4 grid grid-cols-4 gap-2">
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
      </div>
    </div>
  );
}

function Fila({ termino, valor }: { termino: string; valor: string }) {
  return (
    <p className="flex gap-1.5">
      <span className="text-slate-500">{termino}:</span>
      <span className="truncate font-medium text-slate-900">{valor}</span>
    </p>
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
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.13h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.17 8.17 0 0 1-1.26-4.36c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.41a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.21-8.24 8.21Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.23-.17-.48-.29Z" />
    </svg>
  );
}
