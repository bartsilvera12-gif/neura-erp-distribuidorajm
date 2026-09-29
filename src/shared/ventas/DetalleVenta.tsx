"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import ModalCaja from "@/shared/caja/ModalCaja";
import FacturaVenta from "@/shared/caja/FacturaVenta";
import { useEmisor } from "@/shared/hooks/useEmisor";
import { METODOS_PAGO, type Venta } from "@/lib/ventas/types";
import type { DatosComprobante } from "@/lib/ventas/comprobante";

const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString("es-PY")}`;

function cant(v: number, unidad?: string | null): string {
  const n = Number.isInteger(v) ? String(v) : v.toLocaleString("es-PY", { maximumFractionDigits: 3 });
  return unidad ? `${n} ${unidad}` : n;
}

function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-PY", {
    timeZone: "America/Asuncion",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formaDePago(v: Venta): string {
  if (v.tipo_venta === "CREDITO") return v.plazo_dias ? `Crédito a ${v.plazo_dias} días` : "Crédito";
  return METODOS_PAGO.find((m) => m.value === v.metodo_pago)?.label ?? "Contado";
}

function Dato({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
      <p className="mt-0.5 break-words text-sm font-medium text-slate-800">{valor}</p>
    </div>
  );
}

/**
 * Detalle de una venta: quién, cómo se cobró, qué se llevó y cuánto, y el
 * comprobante para volver a imprimirlo o mandarlo.
 *
 * La lista de ventas muestra un renglón por venta y sirve para encontrarla;
 * esto es para mirarla: cada producto con su cantidad, precio, IVA y subtotal,
 * y el IVA incluido separado por tasa, que es lo que se controla contra la
 * factura. Mismo componente en el celular y en la computadora.
 */
export default function DetalleVenta({
  venta,
  onCerrar,
  onAnular,
}: {
  venta: Venta;
  onCerrar: () => void;
  /** Si se pasa, aparece "Anular venta" (solo para ventas no anuladas). */
  onAnular?: () => void;
}) {
  const { emisor } = useEmisor();
  const [verComprobante, setVerComprobante] = useState(false);
  const anulada = (venta.estado ?? "").toLowerCase() === "anulada";

  const iva5 = venta.items.filter((i) => i.tipo_iva === "5%").reduce((s, i) => s + i.monto_iva, 0);
  const iva10 = venta.items.filter((i) => i.tipo_iva === "10%").reduce((s, i) => s + i.monto_iva, 0);
  const exentas = venta.items.filter((i) => i.tipo_iva === "EXENTA").reduce((s, i) => s + i.subtotal, 0);

  const datos: DatosComprobante = {
    venta,
    emisor,
    cliente: venta.cliente_nombre ?? "Sin nombre",
    clienteRuc: venta.cliente_ruc ?? null,
    clienteDireccion: venta.cliente_direccion ?? null,
    formaPago: formaDePago(venta),
    unidades: Object.fromEntries(
      venta.items.filter((i) => i.unidad_medida).map((i) => [i.producto_id, i.unidad_medida as string])
    ),
  };

  if (verComprobante) {
    return (
      <ModalCaja
        titulo={`Comprobante ${venta.numero_control}`}
        onCerrar={onCerrar}
        pie={
          <button
            type="button"
            onClick={() => setVerComprobante(false)}
            className="h-11 rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Volver al detalle
          </button>
        }
      >
        <FacturaVenta datos={datos} />
      </ModalCaja>
    );
  }

  return (
    <ModalCaja
      titulo={`Venta ${venta.numero_control}`}
      subtitulo={fechaHora(venta.fecha)}
      onCerrar={onCerrar}
      pie={
        <>
          {onAnular && !anulada ? (
            <button
              type="button"
              onClick={onAnular}
              className="mr-auto h-11 whitespace-nowrap rounded-lg px-2 text-sm font-medium text-rose-600 hover:bg-rose-50 sm:px-3"
            >
              Anular<span className="hidden sm:inline"> venta</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCerrar}
            className="h-11 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:px-4"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => setVerComprobante(true)}
            className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#4FAEB2] px-3 text-sm font-semibold text-white hover:bg-[#3F8E91] sm:px-4"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Ver comprobante</span>
            <span className="sm:hidden">Comprobante</span>
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {anulada ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            Venta anulada: no cuenta en caja, stock ni reportes.
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Dato label="Cliente" valor={venta.cliente_nombre ?? "Sin nombre"} />
          <Dato
            label="Condición"
            valor={
              <span
                className={`inline-flex items-center gap-1.5 ${
                  venta.tipo_venta === "CREDITO" ? "text-amber-700" : "text-emerald-700"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${
                    venta.tipo_venta === "CREDITO" ? "bg-amber-400" : "bg-emerald-500"
                  }`}
                />
                {venta.tipo_venta === "CREDITO" ? "Crédito" : "Contado"}
              </span>
            }
          />
          <Dato label="Forma de pago" valor={formaDePago(venta)} />
          <Dato label="Precio" valor={venta.lista_precio === "mayorista" ? "Mayorista (−10%)" : "Minorista"} />
          <Dato label="Salió de" valor={venta.reparto_etiqueta ?? "Mostrador"} />
          {venta.moneda === "USD" ? (
            <Dato label="Moneda" valor={`USD · cambio ${venta.tipo_cambio.toLocaleString("es-PY")}`} />
          ) : null}
        </div>

        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            Productos ({venta.items.length})
          </p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {venta.items.map((it, i) => (
              <li key={`${it.producto_id}-${i}`} className="px-3.5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{it.producto_nombre}</p>
                    <p className="text-xs text-slate-500">
                      {cant(it.cantidad, it.unidad_medida)} × {gs(it.precio_venta)}
                      {it.sku ? <span className="text-slate-400"> · {it.sku}</span> : null}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-slate-900">{gs(it.subtotal)}</p>
                    <p className="text-[11px] text-slate-500">
                      {it.tipo_iva === "EXENTA" ? "Exenta" : `IVA ${it.tipo_iva}`}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-1.5 rounded-xl bg-slate-50 p-4 text-sm">
          {iva5 > 0 ? (
            <div className="flex justify-between text-slate-600">
              <span>IVA 5% incluido</span>
              <span className="tabular-nums">{gs(iva5)}</span>
            </div>
          ) : null}
          {iva10 > 0 ? (
            <div className="flex justify-between text-slate-600">
              <span>IVA 10% incluido</span>
              <span className="tabular-nums">{gs(iva10)}</span>
            </div>
          ) : null}
          {exentas > 0 ? (
            <div className="flex justify-between text-slate-600">
              <span>Exentas</span>
              <span className="tabular-nums">{gs(exentas)}</span>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
            <span>Total</span>
            <span className="tabular-nums">{gs(venta.total)}</span>
          </div>
        </div>
      </div>
    </ModalCaja>
  );
}
