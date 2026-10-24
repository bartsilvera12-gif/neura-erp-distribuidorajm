"use client";

import { Printer, X } from "lucide-react";
import HojaA4 from "@/shared/caja/HojaA4";
import { useEmisor } from "@/shared/hooks/useEmisor";
import {
  LOGO_FACTURA,
  fechaCorta,
  miles,
  ubicacionEmisor,
  type EmisorComprobante,
} from "@/lib/ventas/comprobante";
import { numeroALetras } from "@/lib/ventas/numero-letras";
import { METODOS_COBRO } from "@/lib/ventas/types";

/**
 * Recibo de dinero de un cobro de una venta a crédito: la constancia de que la
 * plata se recibió, con el monto en números y en letras y lugar para la firma.
 *
 * El cobro ya quedó registrado como movimiento de caja; este recibo es el
 * comprobante imprimible de ese cobro. Sale en una hoja A4 con dos copias
 * (original para el cliente, duplicado para el archivo) y una línea de corte.
 */
export interface DatosReciboCobro {
  cliente: string;
  clienteRuc?: string | null;
  ventaNumero: string;
  monto: number;
  /** Lo que quedó debiendo después de este cobro (`null` = no se sabe: recibos viejos). */
  saldo: number | null;
  /** Texto de «En concepto de» si no es el pago de una venta (p. ej. un depósito). */
  concepto?: string;
  medioPago: string;
  fecha: string;
  reciboNumero: string;
}

function medioLabel(valor: string): string {
  return METODOS_COBRO.find((m) => m.value === valor)?.label ?? valor;
}

export default function ReciboCobro({
  datos,
  onCerrar,
}: {
  datos: DatosReciboCobro;
  onCerrar: () => void;
}) {
  const { emisor } = useEmisor();
  return (
    <div className="fixed inset-0 z-[130] overflow-y-auto bg-slate-900/60 backdrop-blur-sm">
      <div className="mx-auto max-w-[830px] px-4 py-5">
        <div className="no-imprimir mb-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            Imprimir recibo
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
            Cerrar
          </button>
        </div>

        <HojaA4>
          <div className="factura-imprimible">
            <style>{`@media print { @page { size: A4; margin: 10mm; } }`}</style>
            <div className="flex flex-col font-[Arial,Helvetica,sans-serif] text-[10pt] leading-snug text-black">
              <Copia datos={datos} emisor={emisor} copia="ORIGINAL: CLIENTE" />
              <div className="my-[7mm] border-t border-dashed border-slate-500" />
              <Copia datos={datos} emisor={emisor} copia="DUPLICADO: ARCHIVO" />
            </div>
          </div>
        </HojaA4>
      </div>
    </div>
  );
}

function Copia({
  datos,
  emisor,
  copia,
}: {
  datos: DatosReciboCobro;
  emisor: EmisorComprobante | null;
  copia: string;
}) {
  const ubicacion = ubicacionEmisor(emisor);
  const concepto = datos.concepto
    ? datos.concepto
    : datos.saldo == null
      ? `Pago de la venta a crédito N° ${datos.ventaNumero}`
      : datos.saldo > 0.5
        ? `Pago de la venta a crédito N° ${datos.ventaNumero} (saldo pendiente: Gs. ${miles(datos.saldo)})`
        : `Pago total de la venta a crédito N° ${datos.ventaNumero}`;

  return (
    <section className="border-2 border-black">
      {/* Emisor, número y monto */}
      <div className="flex items-start gap-3 border-b-2 border-black px-3 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_FACTURA} alt="" className="h-[18mm] w-auto shrink-0" />
        <div className="min-w-0 flex-1 text-[9pt]">
          <p className="font-bold uppercase">
            {emisor?.razon_social ?? emisor?.nombre_fantasia ?? "Distribuidora JM"}
          </p>
          {emisor?.ruc ? <p>RUC: {emisor.ruc}</p> : null}
          {ubicacion ? <p>{ubicacion}</p> : null}
          {emisor?.telefono ? <p>Tel: {emisor.telefono}</p> : null}
          {emisor?.email ? <p>{emisor.email}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[13pt] font-bold">RECIBO DE DINERO</p>
          <p>
            <b>N°:</b> {datos.reciboNumero}
          </p>
          <p className="mt-1 inline-block border-2 border-black px-3 py-1 text-[13pt] font-bold tabular-nums">
            Gs. {miles(datos.monto)}
          </p>
        </div>
      </div>

      {/* Cuerpo */}
      <div className="space-y-2.5 px-4 py-3">
        <Renglon etiqueta="Fecha" valor={fechaCorta(datos.fecha)} />
        <Renglon
          etiqueta="Recibí de"
          valor={`${datos.cliente}${datos.clienteRuc ? ` — RUC/CI: ${datos.clienteRuc}` : ""}`}
        />
        <Renglon etiqueta="La suma de guaraníes" valor={`${numeroALetras(datos.monto)}.-`} />
        <Renglon etiqueta="En concepto de" valor={concepto} />
        <Renglon etiqueta="Forma de pago" valor={medioLabel(datos.medioPago)} />
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
      <span className="flex-1 border-b border-dotted border-black pb-0.5 uppercase">{valor}</span>
    </p>
  );
}
