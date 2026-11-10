"use client";

import { BadgePercent } from "lucide-react";
import { totalesDescuentos, type VentaConDescuento } from "@/lib/ventas/descuentos-reporte";

const n = (v: number) => Math.round(v).toLocaleString("es-PY");
const pct = (v: number) => `${v.toLocaleString("es-PY", { maximumFractionDigits: 2 })}%`;
function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-PY", {
    timeZone: "America/Asuncion",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Ventas con descuento, resaltadas para controlarlas: cliente, venta o
 * factura, importe original, % y monto descontado, lo cobrado y quién lo
 * aplicó. Se usa en el cierre de caja y en Reportes → Descuentos.
 */
export default function TablaDescuentos({
  filas,
  titulo = "Descuentos aplicados",
  conCaja = false,
  vacio,
}: {
  filas: VentaConDescuento[];
  titulo?: string;
  /** Muestra el N.° de caja (en el reporte, que junta varias). */
  conCaja?: boolean;
  /** Texto cuando no hay descuentos; sin él, la tabla no se muestra. */
  vacio?: string;
}) {
  if (filas.length === 0 && !vacio) return null;
  const t = totalesDescuentos(filas);
  return (
    <div className="overflow-hidden rounded-xl border-2 border-amber-300 bg-amber-50/40 print:break-inside-avoid">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-100 px-3 py-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-900">
          <BadgePercent className="h-4 w-4" aria-hidden />
          {titulo} ({t.cantidad})
        </p>
        {t.cantidad > 0 ? (
          <p className="text-sm text-amber-900">
            Descontado <b className="tabular-nums">Gs. {n(t.monto)}</b> · Cobrado{" "}
            <b className="tabular-nums">Gs. {n(t.cobrado)}</b>
          </p>
        ) : null}
      </div>
      {filas.length === 0 ? (
        <p className="px-3 py-3 text-sm text-slate-500">{vacio}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-amber-200 text-left text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Venta / factura</th>
                <th className="px-3 py-2 text-right">Original</th>
                <th className="px-3 py-2 text-right">Descuento</th>
                <th className="px-3 py-2 text-right">Cobrado</th>
                <th className="px-3 py-2">Aplicó</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100">
              {filas.map((d) => (
                <tr key={d.venta_id} className="bg-white/70">
                  <td className="px-3 py-2">
                    <p className="font-medium text-slate-900">{d.cliente}</p>
                    {d.ruc ? <p className="text-xs text-slate-500">RUC/CI {d.ruc}</p> : null}
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-mono text-xs text-slate-800">{d.numero_venta}</p>
                    <p className="text-xs text-slate-500">
                      {d.factura ? `Fact. ${d.factura} · ` : ""}
                      {fechaHora(d.fecha)}
                      {d.tipo_venta === "CREDITO" ? " · crédito" : ""}
                      {conCaja && d.caja_numero ? ` · caja ${d.caja_numero}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{n(d.original)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className="rounded bg-amber-200 px-1.5 py-0.5 font-bold text-amber-900">{pct(d.porcentaje)}</span>
                    <p className="mt-0.5 font-semibold text-rose-600">−{n(d.monto)}</p>
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-900">{n(d.cobrado)}</td>
                  <td className="px-3 py-2 text-slate-700">{d.usuario ?? "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-amber-300 font-bold text-slate-900">
                <td className="px-3 py-2" colSpan={2}>
                  Total
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{n(t.original)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-rose-600">−{n(t.monto)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{n(t.cobrado)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
