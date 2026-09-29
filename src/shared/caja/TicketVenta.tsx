"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { formatCantidad } from "@/lib/inventario/unidades";
import {
  LOGO_FACTURA,
  esFacturaLegal,
  fechaHoraEmision,
  gs,
  numeroFactura,
  type DatosComprobante,
} from "@/lib/ventas/comprobante";

/**
 * El ticket para la impresora térmica (80 mm, o 58 mm): lo que sale en una
 * venta Sin nombre, donde no hay a quién hacerle una factura A4.
 *
 * Mientras no haya timbrado cargado dice que es un comprobante interno: un
 * ticket sin timbrado no es un comprobante válido ante la SET.
 */

type Ancho = 80 | 58;
const CLAVE_ANCHO = "caja:ticket-ancho";

function anchoGuardado(): Ancho {
  try {
    return localStorage.getItem(CLAVE_ANCHO) === "58" ? 58 : 80;
  } catch {
    return 80;
  }
}

export default function TicketVenta({ datos }: { datos: DatosComprobante }) {
  const [ancho, setAncho] = useState<Ancho>(anchoGuardado);
  const { venta, emisor } = datos;
  const legal = esFacturaLegal(emisor);
  const angosto = ancho === 58;

  // El navegador no acepta "alto automático" en @page: se mide el ticket y el
  // papel se corta a ese largo (1 mm ≈ 3,78 px), así no sale una hoja entera.
  const ref = useRef<HTMLElement>(null);
  const [largoMm, setLargoMm] = useState(200);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setLargoMm(Math.ceil(el.offsetHeight / 3.7795) + 4);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ancho]);

  function cambiarAncho() {
    const nuevo: Ancho = angosto ? 80 : 58;
    setAncho(nuevo);
    try {
      localStorage.setItem(CLAVE_ANCHO, String(nuevo));
    } catch {
      // Sin almacenamiento: vale solo para este ticket.
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {/* El papel es del ancho del rollo y el largo del ticket: margen cero,
          que la impresora térmica ya deja el suyo. */}
      <style>{`@media print { @page { size: ${ancho}mm ${largoMm}mm; margin: 0; } }`}</style>

      <article
        ref={ref}
        className="factura-imprimible bg-white font-mono text-black shadow-sm ring-1 ring-slate-200 print:shadow-none print:ring-0"
        style={{
          width: `${ancho}mm`,
          fontSize: angosto ? "10px" : "11.5px",
          lineHeight: 1.35,
        }}
      >
        {/* El margen va adentro: al imprimir, globals.css le saca el padding al papel. */}
        <div style={{ padding: "4mm 3mm" }}>
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_FACTURA} alt="" className="mx-auto h-12 w-auto" />
            <p className="mt-1 font-bold uppercase">
              {emisor?.nombre_fantasia ??
                emisor?.razon_social ??
                "Distribuidora JM"}
            </p>
            {emisor?.ruc ? <p>RUC: {emisor.ruc}</p> : null}
            {legal ? (
              <>
                <p>Timbrado N° {emisor!.timbrado_numero}</p>
                <p className="font-bold">TICKET N° {numeroFactura(datos)}</p>
              </>
            ) : (
              <p className="mt-2 font-bold">{venta.numero_control}</p>
            )}
            <p>{fechaHoraEmision(venta.fecha)}</p>
          </div>

          <Linea />

          <ul className="space-y-1.5">
            {venta.items.map((it) => {
              const u =
                datos.unidades?.[it.producto_id] ?? it.unidad_medida ?? "";
              const cant = `${formatCantidad(it.cantidad, u)}${u && u.toUpperCase() !== "UNIDAD" ? ` ${u}` : ""}`;
              return (
                <li key={it.producto_id}>
                  <div className="flex gap-2">
                    <span className="shrink-0">{cant}×</span>
                    <span className="min-w-0 flex-1 uppercase">
                      {it.producto_nombre}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {gs(it.total_linea)}
                    </span>
                  </div>
                  <p className="pl-6">
                    {cant} × {gs(it.precio_venta)}
                  </p>
                </li>
              );
            })}
          </ul>

          <Linea />

          <Fila etiqueta="Subtotal" valor={gs(venta.total - venta.monto_iva)} />
          <Fila etiqueta="IVA" valor={gs(venta.monto_iva)} />
          <div className="my-1 border-t border-black" />
          <Fila etiqueta="TOTAL" valor={gs(venta.total)} fuerte />
          <Fila etiqueta="Pago" valor={datos.formaPago} />

          <Linea />

          <div className="text-center italic">
            <p>¡Gracias por su compra!</p>
            {emisor?.leyenda ? (
              <p className="not-italic">{emisor.leyenda}</p>
            ) : null}
            {!legal ? (
              <p>Comprobante interno — no válido como factura legal.</p>
            ) : null}
          </div>
        </div>
      </article>

      <div className="no-imprimir flex items-center gap-4">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg border border-slate-800 bg-white px-5 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          Imprimir
        </button>
        <button
          type="button"
          onClick={cambiarAncho}
          className="font-mono text-sm text-slate-700 underline underline-offset-2"
        >
          Cambiar a {angosto ? "80mm" : "58mm"}
        </button>
      </div>
    </div>
  );
}

function Linea() {
  return <div className="my-2 border-t border-dashed border-black" />;
}

function Fila({
  etiqueta,
  valor,
  fuerte,
}: {
  etiqueta: string;
  valor: string;
  fuerte?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-2 ${fuerte ? "text-[1.15em] font-bold" : ""}`}
    >
      <span>{etiqueta}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );
}
