"use client";

import { Printer } from "lucide-react";
import HojaA4 from "@/shared/caja/HojaA4";
import {
  LOGO_FACTURA,
  esFacturaLegal,
  fechaCorta,
  miles,
  numeroFactura,
  ubicacionEmisor,
  type DatosComprobante,
} from "@/lib/ventas/comprobante";
import { numeroALetras } from "@/lib/ventas/numero-letras";

/**
 * Recibo de dinero de una venta al contado: constancia de que la plata se
 * recibió, con el monto en números y en letras y lugar para la firma.
 *
 * Sale en una hoja A4 con dos copias (original para el cliente, duplicado
 * para la empresa) y una línea de corte en el medio.
 */
export default function ReciboVenta({ datos }: { datos: DatosComprobante }) {
  return (
    <div className="mx-auto max-w-[830px] px-4 py-5">
      <div className="no-imprimir mb-4 flex justify-center">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          <Printer className="h-4 w-4" />
          Imprimir recibo
        </button>
      </div>

      <HojaA4>
        <div className="factura-imprimible">
          <style>{`@media print { @page { size: A4; margin: 10mm; } }`}</style>
          <div className="flex flex-col font-[Arial,Helvetica,sans-serif] text-[10pt] leading-snug text-black">
            <Copia datos={datos} copia="ORIGINAL: CLIENTE" />
            <div className="my-[7mm] border-t border-dashed border-slate-500" />
            <Copia datos={datos} copia="DUPLICADO: ARCHIVO" />
          </div>
        </div>
      </HojaA4>
    </div>
  );
}

function Copia({ datos, copia }: { datos: DatosComprobante; copia: string }) {
  const { venta, emisor } = datos;
  const ubicacion = ubicacionEmisor(emisor);
  const legal = esFacturaLegal(emisor);
  const monto =
    venta.moneda === "USD" ? venta.total * venta.tipo_cambio : venta.total;
  const documento = legal
    ? `factura N° ${numeroFactura(datos)}`
    : `venta N° ${venta.numero_control}`;

  return (
    <section className="border-2 border-black">
      {/* Emisor, número y monto */}
      <div className="flex items-start gap-3 border-b-2 border-black px-3 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_FACTURA} alt="" className="h-[18mm] w-auto shrink-0" />
        <div className="min-w-0 flex-1 text-[9pt]">
          <p className="font-bold uppercase">
            {emisor?.razon_social ??
              emisor?.nombre_fantasia ??
              "Distribuidora JM"}
          </p>
          {emisor?.ruc ? <p>RUC: {emisor.ruc}</p> : null}
          {ubicacion ? <p>{ubicacion}</p> : null}
          {emisor?.telefono ? <p>Tel: {emisor.telefono}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[13pt] font-bold">RECIBO DE DINERO</p>
          <p>
            <b>N°:</b> {venta.numero_control}
          </p>
          <p className="mt-1 inline-block border-2 border-black px-3 py-1 text-[13pt] font-bold tabular-nums">
            Gs. {miles(monto)}
          </p>
        </div>
      </div>

      {/* Cuerpo */}
      <div className="space-y-2.5 px-4 py-3">
        <Renglon etiqueta="Fecha" valor={fechaCorta(venta.fecha)} />
        <Renglon
          etiqueta="Recibí de"
          valor={`${datos.cliente}${datos.clienteRuc ? ` — RUC/CI: ${datos.clienteRuc}` : ""}`}
        />
        <Renglon
          etiqueta="La suma de guaraníes"
          valor={`${numeroALetras(monto)}.-`}
        />
        <Renglon
          etiqueta="En concepto de"
          valor={`Pago al contado de la ${documento}`}
        />
        <Renglon etiqueta="Forma de pago" valor={datos.formaPago} />
      </div>

      {/* Firma */}
      <div className="flex items-end justify-between px-4 pb-3 pt-8">
        <p className="text-[8pt] font-bold">{copia}</p>
        <div className="w-[70mm] text-center">
          <div className="border-t border-black" />
          <p className="mt-1 text-[9pt]">Firma y aclaración</p>
        </div>
      </div>
    </section>
  );
}

/** Un renglón del recibo: etiqueta en negrita y el dato sobre la línea punteada. */
function Renglon({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <p className="flex items-baseline gap-2">
      <b className="shrink-0">{etiqueta}:</b>
      <span className="flex-1 border-b border-dotted border-black pb-0.5 uppercase">
        {valor}
      </span>
    </p>
  );
}
