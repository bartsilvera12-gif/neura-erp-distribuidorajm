"use client";

import { cantidadProd, type DesgloseVentas, type FilaProducto } from "@/lib/cajas/por-producto";

const gs = (v: number) => `Gs. ${Math.round(v).toLocaleString("es-PY")}`;

/**
 * Vendido por producto: código, producto, cargado al camión, devuelto, vendido
 * y monto. Sirve para verificar cargas, ventas y devoluciones del camión.
 */
export function VentasPorProducto({ filas }: { filas: FilaProducto[] }) {
  if (filas.length === 0) return null;
  const total = filas.reduce((s, f) => s + f.monto, 0);
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
      <div className="flex items-center justify-between bg-slate-50 px-3 py-2">
        <p className="text-sm font-semibold text-slate-800">Vendido por producto</p>
        <p className="text-sm font-bold tabular-nums text-slate-900">{gs(total)}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-2 py-1.5 font-semibold">Código</th>
              <th className="px-2 py-1.5 font-semibold">Producto</th>
              <th className="px-2 py-1.5 text-right font-semibold">Cargada</th>
              <th className="px-2 py-1.5 text-right font-semibold">Devuelta</th>
              <th className="px-2 py-1.5 text-right font-semibold">Vendida</th>
              <th className="px-2 py-1.5 text-right font-semibold">Monto vendido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map((f) => (
              <tr key={f.producto_id}>
                <td className="whitespace-nowrap px-2 py-1 text-slate-500">{f.codigo}</td>
                <td className="px-2 py-1 text-slate-800">{f.producto}</td>
                <td className="px-2 py-1 text-right tabular-nums text-slate-600">{cantidadProd(f.cargada)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-slate-600">{cantidadProd(f.devuelta)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-slate-900">{cantidadProd(f.vendida)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right font-medium tabular-nums text-slate-900">
                  {gs(f.monto)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Desglose de ventas: lo vendido (por condición: contado o crédito) separado de
 * lo cobrado (por medio: efectivo o transferencia), y el efectivo esperado.
 */
export function DesgloseDeVentas({ d }: { d: DesgloseVentas }) {
  const fila = (texto: string, valor: number, fuerte = false) => (
    <div className={`flex items-center justify-between gap-3 py-0.5 text-sm ${fuerte ? "font-bold text-slate-900" : "text-slate-600"}`}>
      <span>{texto}</span>
      <span className="tabular-nums">{gs(valor)}</span>
    </div>
  );
  return (
    <div className="mt-3 rounded-xl border border-slate-200 p-3">
      <p className="mb-1 text-sm font-semibold text-slate-800">Desglose de ventas</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Lo vendido</p>
      {fila("Total vendido", d.total, true)}
      {fila("Ventas al contado", d.contado)}
      {fila("Ventas a crédito", d.credito)}
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Lo cobrado</p>
      {fila("Cobros en efectivo", d.cobro_efectivo)}
      {fila("Cobros por transferencia", d.cobro_transferencia)}
      {d.cobro_otros > 0 ? fila("Cobros con otros medios", d.cobro_otros) : null}
      <div className="my-1.5 border-t border-slate-100" />
      {fila("Total efectivo esperado en caja", d.efectivo_esperado, true)}
      <p className="mt-0.5 text-[11px] text-slate-400">
        El crédito no entra al cajón; las transferencias entran al banco, no en efectivo.
      </p>
    </div>
  );
}
