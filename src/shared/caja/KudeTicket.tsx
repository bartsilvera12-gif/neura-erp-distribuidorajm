"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { LOGO_FACTURA } from "@/lib/ventas/comprobante";
import { emailVisible, telefonoVisible } from "@/lib/sifen/contacto-relleno";
import type { KudeParsedFromXml } from "@/lib/sifen/parse-kude-from-signed-xml";

/**
 * El KuDE de la factura electrónica en formato ticket (rollo de 80 mm, o
 * 58 mm), para la impresora térmica de la caja. Lleva lo mismo que el A4 —
 * timbrado, número, cliente, detalle, totales, liquidación del IVA, QR y
 * CDC— en una columna.
 *
 * Los datos salen del XML firmado y aprobado (el servidor los lee y arma el
 * QR); acá solo se dibujan.
 */

type Ancho = 80 | 58;
/** El mismo ancho que el ticket de la caja: la impresora es la misma. */
const CLAVE_ANCHO = "caja:ticket-ancho";

type DatosKude = {
  parsed: KudeParsedFromXml;
  numeroFactura: string;
  dProtAut: string | null;
  qrUrl: string;
  qrDataUrl: string;
};

function anchoGuardado(): Ancho {
  try {
    return localStorage.getItem(CLAVE_ANCHO) === "58" ? 58 : 80;
  } catch {
    return 80;
  }
}

function num(valor: string): number {
  const n = Number.parseFloat(String(valor).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function monto(valor: string, moneda: string): string {
  const n = num(valor);
  return moneda === "PYG"
    ? Math.round(n).toLocaleString("es-PY")
    : n.toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cantidad(valor: string): string {
  return num(valor).toLocaleString("es-PY", { maximumFractionDigits: 3 });
}

/** "2026-10-16T10:22:33" → "16/10/2026 10:22:33". */
function fechaXml(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}:\d{2}))?/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}` : ""}`;
}

/** El CDC en grupos de 4, como lo pide la SET para leerlo a mano. */
function cdcEnGrupos(cdc: string): string {
  return cdc.replace(/(.{4})/g, "$1 ").trim();
}

export default function KudeTicket({ facturaId }: { facturaId: string }) {
  const [datos, setDatos] = useState<DatosKude | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ancho, setAncho] = useState<Ancho>(anchoGuardado);
  const angosto = ancho === 58;

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetchWithSupabaseSession(`/api/facturas/${facturaId}/sifen/kude?formato=ticket`);
        const j = (await res.json().catch(() => ({}))) as { data?: DatosKude; error?: string };
        if (!res.ok || !j.data) throw new Error(j.error ?? `No se pudo obtener la factura (${res.status}).`);
        if (!cancelado) setDatos(j.data);
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : "No se pudo obtener la factura.");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [facturaId]);

  // El papel se corta al largo del ticket (1 mm ≈ 3,78 px), como en TicketVenta.
  const ref = useRef<HTMLElement>(null);
  const [largoMm, setLargoMm] = useState(250);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setLargoMm(Math.ceil(el.offsetHeight / 3.7795) + 4);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ancho, datos]);

  function cambiarAncho() {
    const nuevo: Ancho = angosto ? 80 : 58;
    setAncho(nuevo);
    try {
      localStorage.setItem(CLAVE_ANCHO, String(nuevo));
    } catch {
      // Sin almacenamiento: vale solo para este ticket.
    }
  }

  if (error) {
    return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  }
  if (!datos) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando factura…
      </p>
    );
  }

  const { parsed: p } = datos;
  const mon = p.monedaCodigo || "PYG";
  const numero = `${p.timbrado.dEst}-${p.timbrado.dPunExp}-${p.timbrado.dNumDoc}`;
  const t = p.totales;

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="no-imprimir flex items-center gap-4">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          <Printer className="h-4 w-4" />
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

      <style>{`@media print { @page { size: ${ancho}mm ${largoMm}mm; margin: 0; } }`}</style>

      <article
        ref={ref}
        className="factura-imprimible bg-white font-mono text-black shadow-sm ring-1 ring-slate-200 print:shadow-none print:ring-0"
        style={{ width: `${ancho}mm`, fontSize: angosto ? "9.5px" : "11px", lineHeight: 1.35 }}
      >
        <div style={{ padding: "4mm 3mm" }}>
          {/* Emisor y timbrado */}
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_FACTURA} alt="" className="mx-auto h-12 w-auto" />
            <p className="mt-1 font-bold uppercase">{p.emisor.dNomEmi}</p>
            <p>RUC: {p.emisor.dRucEm}-{p.emisor.dDVEmi}</p>
            {p.emisor.dDirEmi ? <p className="uppercase">{p.emisor.dDirEmi}</p> : null}
            {telefonoVisible(p.emisor.dTelEmi) ? <p>Tel: {telefonoVisible(p.emisor.dTelEmi)}</p> : null}
            {emailVisible(p.emisor.dEmailE) ? <p>{emailVisible(p.emisor.dEmailE)}</p> : null}
            <Linea />
            <p>Timbrado N° {p.timbrado.dNumTim}</p>
            {p.timbrado.dFeIniT ? <p>Inicio de vigencia: {fechaXml(p.timbrado.dFeIniT)}</p> : null}
            <p className="mt-1 font-bold">FACTURA ELECTRÓNICA</p>
            <p className="font-bold">N° {numero}</p>
          </div>

          <Linea />

          {/* Operación y cliente */}
          <Fila etiqueta="Fecha" valor={fechaXml(p.dFeEmiDE)} />
          <Fila etiqueta="Condición" valor={p.operacion.condicionVenta} />
          <Fila etiqueta="Moneda" valor={mon === "PYG" ? "Guaraní" : p.monedaDescripcion || mon} />
          <p className="mt-1">
            <b>Cliente:</b> <span className="uppercase">{p.receptor.nombre}</span>
          </p>
          {p.receptor.docValue ? (
            <p>
              <b>{p.receptor.docLabel}:</b> {p.receptor.docValue}
            </p>
          ) : null}
          {p.receptor.direccion ? (
            <p>
              <b>Dirección:</b> {p.receptor.direccion}
            </p>
          ) : null}

          <Linea />

          {/* Detalle */}
          <div className="flex justify-between font-bold">
            <span>Cant. × Precio</span>
            <span>Total</span>
          </div>
          <ul className="mt-1 space-y-1.5">
            {p.items.map((it, i) => {
              const iva =
                num(it.montoGrav10) > 0 ? "10%" : num(it.montoGrav5) > 0 ? "5%" : "Ex.";
              return (
                <li key={`${it.codigo}-${i}`}>
                  <p className="uppercase">{it.descripcion}</p>
                  <div className="flex justify-between gap-2">
                    <span>
                      {cantidad(it.cantidad)} × {monto(it.precioUnit, mon)}
                      <span className="ml-1.5 text-[0.9em]">({iva})</span>
                    </span>
                    <span className="tabular-nums">{monto(it.totalLinea, mon)}</span>
                  </div>
                </li>
              );
            })}
          </ul>

          <Linea />

          {/* Totales */}
          {num(t.dSubExe) > 0 ? <Fila etiqueta="Subtotal exentas" valor={monto(t.dSubExe, mon)} /> : null}
          {num(t.dSub5) > 0 ? <Fila etiqueta="Subtotal 5%" valor={monto(t.dSub5, mon)} /> : null}
          {num(t.dSub10) > 0 ? <Fila etiqueta="Subtotal 10%" valor={monto(t.dSub10, mon)} /> : null}
          <div className="my-1 border-t border-black" />
          <Fila etiqueta="TOTAL" valor={`${mon === "PYG" ? "Gs." : mon} ${monto(t.dTotGralOpe, mon)}`} fuerte />

          <Linea />

          <p className="font-bold">Liquidación del IVA</p>
          <Fila etiqueta="IVA 5%" valor={monto(t.dIVA5, mon)} />
          <Fila etiqueta="IVA 10%" valor={monto(t.dIVA10, mon)} />
          <Fila etiqueta="Total IVA" valor={monto(t.dTotIVA, mon)} />

          <Linea />

          {/* QR y CDC */}
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={datos.qrDataUrl}
              alt="QR de la factura electrónica"
              className="mx-auto"
              style={{ width: angosto ? "30mm" : "36mm", height: angosto ? "30mm" : "36mm" }}
            />
            <p className="mt-2">Consulte la validez de esta Factura Electrónica con el número de CDC en:</p>
            <p className="break-all font-bold">https://ekuatia.set.gov.py/consultas</p>
            <p className="mt-1 font-bold">CDC:</p>
            <p className="font-bold">{cdcEnGrupos(p.cdc)}</p>
            {datos.dProtAut ? <p className="mt-1">Protocolo de autorización: {datos.dProtAut}</p> : null}
            <p className="mt-2 text-[0.9em]">
              ESTE DOCUMENTO ES UNA REPRESENTACIÓN GRÁFICA DE UN DOCUMENTO ELECTRÓNICO (XML)
            </p>
            <p className="mt-2 italic">¡Gracias por su compra!</p>
          </div>
        </div>
      </article>
    </div>
  );
}

function Linea() {
  return <div className="my-2 border-t border-dashed border-black" />;
}

function Fila({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${fuerte ? "text-[1.15em] font-bold" : ""}`}>
      <span>{etiqueta}</span>
      <span className="text-right tabular-nums">{valor}</span>
    </div>
  );
}
