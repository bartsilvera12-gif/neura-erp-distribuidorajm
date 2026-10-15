import type { Venta } from "@/lib/ventas/types";

/**
 * Qué comprobante tiene la venta y en qué quedó ante la SET.
 *
 * Con factura electrónica: el número como lo ve la SET y su estado
 * (aprobada, rechazada, en proceso). Sin factura: comprobante interno
 * (ticket u hoja), que no es documento fiscal.
 */
export function estadoFactura(v: Venta): { texto: string; clase: string } | null {
  if (!v.factura_id) return null;
  switch (v.factura_estado_sifen) {
    case "aprobado":
      return { texto: "Aprobada", clase: "bg-emerald-50 text-emerald-700" };
    case "rechazado":
      return { texto: "Rechazada", clase: "bg-rose-50 text-rose-700" };
    case "cancelado":
      return { texto: "Cancelada", clase: "bg-slate-100 text-slate-600" };
    case "error_envio":
      return { texto: "Error al enviar", clase: "bg-rose-50 text-rose-700" };
    default:
      return { texto: "En proceso", clase: "bg-sky-50 text-sky-700" };
  }
}

export default function ComprobanteVenta({ venta }: { venta: Venta }) {
  const est = estadoFactura(venta);
  if (!est) {
    return <span className="text-xs text-slate-400">Interno</span>;
  }
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="whitespace-nowrap font-mono text-xs text-slate-700">{venta.factura_numero ?? "Factura"}</span>
      <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${est.clase}`}>
        {est.texto}
      </span>
    </span>
  );
}
