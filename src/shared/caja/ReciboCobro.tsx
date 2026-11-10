"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { MessageCircle, Printer, X } from "lucide-react";
import { useEmisor } from "@/shared/hooks/useEmisor";
import { fechaCorta, miles, ubicacionEmisor } from "@/lib/ventas/comprobante";
import { numeroALetras } from "@/lib/ventas/numero-letras";
import { METODOS_COBRO } from "@/lib/ventas/types";

/**
 * Recibo de dinero de un cobro / depósito.
 *
 * Formato ticket 80mm (una sola copia). Antes era hoja A4 con original +
 * duplicado, pero la clienta de Distribuidora JM pidió simplificar: un
 * comprobante único, imprimible en la térmica de la caja (ticket 80 mm) y
 * mandable al cliente por WhatsApp. Pedido explícito del soporte, punto 2.
 *
 * Mantiene el mismo contrato `DatosReciboCobro`, así que todas las pantallas
 * que ya lo abren (CobranzasCredito, RecibosDinero, etc.) siguen andando sin
 * cambios.
 */
export interface DatosReciboCobro {
  cliente: string;
  clienteRuc?: string | null;
  ventaNumero: string;
  monto: number;
  /** Lo que quedó debiendo después de este cobro (`null` = no se sabe: recibos viejos). */
  saldo: number | null;
  /** Texto de "En concepto de" si no es el pago de una venta (p. ej. un depósito). */
  concepto?: string;
  medioPago: string;
  fecha: string;
  reciboNumero: string;
  /** Teléfono del cliente para enviar por WhatsApp (sin + ni espacios). */
  telefono?: string | null;
}

type ItemDeVenta = { producto: string; cantidad: number; empaque: string | null };

/** «3 Caja x12 · Pollo entero», «2,5 Queso paraguay». */
function lineaItem(i: ItemDeVenta): string {
  const cant = Number.isInteger(i.cantidad) ? String(i.cantidad) : i.cantidad.toLocaleString("es-PY", { maximumFractionDigits: 3 });
  return i.empaque ? `${cant} ${i.empaque} · ${i.producto}` : `${cant} ${i.producto}`;
}

/** Lo que se llevó en la venta que se está pagando: va en «En concepto de». */
function useItemsDeVenta(numero: string | null) {
  const key = numero ? `/api/ventas/items?numero=${encodeURIComponent(numero)}` : null;
  const { data } = useSWR<ItemDeVenta[]>(key, async (url: string) => {
    const res = await fetchWithSupabaseSession(url, { cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as { data?: { items?: ItemDeVenta[] } };
    return res.ok ? (j.data?.items ?? []) : [];
  });
  return data ?? null;
}

function medioLabel(valor: string): string {
  return METODOS_COBRO.find((m) => m.value === valor)?.label ?? valor;
}

/** Ancho del ticket en mm. El largo lo calculamos midiendo el contenido real. */
const ANCHO_MM = 80;
const PX_POR_MM = 96 / 25.4;

export default function ReciboCobro({
  datos,
  onCerrar,
}: {
  datos: DatosReciboCobro;
  onCerrar: () => void;
}) {
  const { emisor } = useEmisor();
  // Un depósito trae su propio concepto; el pago de una venta muestra qué se llevó.
  const items = useItemsDeVenta(!datos.concepto && datos.ventaNumero ? datos.ventaNumero : null);
  const refTicket = useRef<HTMLDivElement>(null);
  const [largoMm, setLargoMm] = useState<number>(150);

  // Medir el alto real del ticket así @page encaja sin cortes raros entre hojas.
  useEffect(() => {
    if (!refTicket.current) return;
    const alto = refTicket.current.getBoundingClientRect().height;
    // + 4mm de margen inferior.
    setLargoMm(Math.max(60, Math.ceil(alto / PX_POR_MM) + 4));
  }, [datos, items]);

  function imprimir() {
    window.print();
  }

  function abrirWhatsApp() {
    const tel = (datos.telefono ?? "").replace(/\D/g, "");
    const texto =
      `Hola${datos.cliente ? ` ${datos.cliente}` : ""}, acá va el recibo ${datos.reciboNumero} por Gs. ${miles(datos.monto)}. ¡Gracias!`;
    const base = tel ? `https://wa.me/${tel}` : `https://wa.me/`;
    window.open(`${base}?text=${encodeURIComponent(texto)}`, "_blank");
  }

  const concepto = datos.concepto
    ? datos.concepto
    : datos.saldo == null
      ? `Pago de la venta a crédito N° ${datos.ventaNumero}`
      : datos.saldo > 0.5
        ? `Pago de la venta a crédito N° ${datos.ventaNumero} (saldo pendiente: Gs. ${miles(datos.saldo)})`
        : `Pago total de la venta a crédito N° ${datos.ventaNumero}`;

  const ubicacion = ubicacionEmisor(emisor);

  return (
    <div className="fixed inset-0 z-[130] overflow-y-auto bg-slate-900/60 backdrop-blur-sm">
      <style>{`@media print { @page { size: ${ANCHO_MM}mm ${largoMm}mm; margin: 0; } .no-imprimir { display: none !important; } body { margin: 0 !important; } }`}</style>
      <div className="mx-auto max-w-[520px] px-4 py-5">
        <div className="no-imprimir mb-3 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={imprimir}
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            <Printer className="h-4 w-4" />
            Imprimir recibo
          </button>
          <button
            type="button"
            onClick={abrirWhatsApp}
            className="flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1EBE5A]"
          >
            <MessageCircle className="h-4 w-4" />
            Enviar por WhatsApp
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
            Cerrar
          </button>
        </div>

        {/* El ticket en si. mx-auto + w-[80mm] para que el preview tambien
            se vea del tamanyo real. El estilo print lo deja tal cual. */}
        <div
          ref={refTicket}
          className="mx-auto bg-white px-[3mm] py-[3mm] font-[monospace] text-[10pt] leading-[1.2] text-black shadow-md print:shadow-none"
          style={{ width: `${ANCHO_MM}mm`, pageBreakAfter: "auto" }}
        >
          {/* Encabezado */}
          <div className="text-center">
            <p className="text-[11pt] font-bold uppercase leading-tight">
              {emisor?.razon_social ?? emisor?.nombre_fantasia ?? "Distribuidora JM"}
            </p>
            {emisor?.ruc ? <p>RUC: {emisor.ruc}</p> : null}
            {ubicacion ? <p className="text-[8pt]">{ubicacion}</p> : null}
            {emisor?.telefono ? <p className="text-[8pt]">Tel: {emisor.telefono}</p> : null}
          </div>

          <div className="my-2 border-t border-dashed border-black" />

          <p className="text-center text-[12pt] font-bold">RECIBO DE DINERO</p>
          <p className="text-center">N° {datos.reciboNumero}</p>
          <p className="text-center">{fechaCorta(datos.fecha)}</p>

          <div className="my-2 border-t border-dashed border-black" />

          {/* Monto grande */}
          <p className="text-center text-[16pt] font-bold tabular-nums">
            Gs. {miles(datos.monto)}
          </p>

          <div className="my-2 border-t border-dashed border-black" />

          {/* Cuerpo */}
          <div className="space-y-1.5">
            <div>
              <p className="text-[8pt] font-bold uppercase">Recibí de</p>
              <p className="uppercase">
                {datos.cliente}
                {datos.clienteRuc ? ` (${datos.clienteRuc})` : ""}
              </p>
            </div>
            <div>
              <p className="text-[8pt] font-bold uppercase">La suma de guaraníes</p>
              <p className="uppercase leading-tight">{numeroALetras(datos.monto)}.-</p>
            </div>
            <div>
              <p className="text-[8pt] font-bold uppercase">En concepto de</p>
              <p className="leading-tight">{concepto}</p>
              {items && items.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-[9pt] leading-tight">
                  {items.map((i, n) => (
                    <li key={n}>- {lineaItem(i)}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-[8pt] font-bold uppercase">Forma de pago:</p>
              <p className="uppercase">{medioLabel(datos.medioPago)}</p>
            </div>
          </div>

          <div className="my-3 border-t border-dashed border-black" />

          {/* Firma */}
          <div className="mt-5 text-center">
            <div className="mx-auto w-[55mm] border-t border-black" />
            <p className="mt-0.5 text-[8pt]">Firma y aclaración</p>
          </div>

          <p className="mt-3 text-center text-[8pt] text-slate-500">
            ¡Gracias por su pago!
          </p>
        </div>
      </div>
    </div>
  );
}
