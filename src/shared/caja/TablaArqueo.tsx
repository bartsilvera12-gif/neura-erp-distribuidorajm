"use client";

import type { ArqueoCaja } from "@/lib/cajas/arqueo";
import { formatGs } from "@/shared/caja/useCajaVenta";

const TINTA = "#0B3A3D";

/** Orden fijo: la tabla se lee siempre igual, aunque ese día no haya entrado nada por un medio. */
const MEDIOS: { medio: string; label: string }[] = [
  { medio: "efectivo", label: "Efectivo" },
  { medio: "transferencia", label: "Transferencia" },
  { medio: "tarjeta", label: "Tarjeta" },
  { medio: "cheque", label: "Cheque" },
];

/**
 * Lo cobrado del día por forma de pago, como la planilla que ya llevaban a mano.
 *
 * Las cuatro filas están siempre, con cero cuando no hubo: una tabla que cambia
 * de filas según el día obliga a leerla entera cada vez para encontrar el
 * efectivo.
 *
 * El crédito va separado y con su aclaración. Es venta, no cobranza: no está en
 * el cajón y sumarlo al efectivo haría que el arqueo nunca cuadre.
 */
export default function TablaArqueo({
  cajas,
  credito,
}: {
  cajas: ArqueoCaja[];
  credito?: { cantidad: number; total: number };
}) {
  const porMedio = new Map<string, { cantidad: number; total: number }>();
  for (const caja of cajas) {
    for (const m of caja.ingresos.por_medio) {
      const acc = porMedio.get(m.medio) ?? { cantidad: 0, total: 0 };
      acc.cantidad += m.cantidad;
      acc.total += m.total;
      porMedio.set(m.medio, acc);
    }
  }

  // Un medio que la empresa use y no esté en la lista fija igual se muestra:
  // esconder plata cobrada sería peor que romper el orden.
  const extras = [...porMedio.keys()].filter((m) => !MEDIOS.some((f) => f.medio === m));

  const filas = [
    ...MEDIOS.map((f) => ({ ...f, ...(porMedio.get(f.medio) ?? { cantidad: 0, total: 0 }) })),
    ...extras.map((m) => ({
      medio: m,
      label: m === "" ? "Sin registrar" : m.charAt(0).toUpperCase() + m.slice(1),
      ...(porMedio.get(m) ?? { cantidad: 0, total: 0 }),
    })),
  ];

  const cobrado = filas.reduce((acc, f) => acc + f.total, 0);
  const totalDia = cobrado + (credito?.total ?? 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-slate-600">
            <th className="px-3 py-2 text-left text-xs font-semibold">Forma de pago</th>
            <th className="px-3 py-2 text-center text-xs font-semibold">Cantidad</th>
            <th className="px-3 py-2 text-right text-xs font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.medio} className="border-t border-slate-100">
              <td className={`px-3 py-2.5 ${f.total > 0 ? "text-slate-900" : "text-slate-400"}`}>
                {f.label}
              </td>
              <td
                className={`px-3 py-2.5 text-center tabular-nums ${
                  f.total > 0 ? "text-slate-700" : "text-slate-300"
                }`}
              >
                {f.cantidad}
              </td>
              <td
                className={`px-3 py-2.5 text-right font-medium tabular-nums ${
                  f.total > 0 ? "text-slate-900" : "text-slate-300"
                }`}
              >
                {formatGs(f.total)}
              </td>
            </tr>
          ))}

          {credito ? (
            <tr className="border-t border-slate-100">
              <td className={`px-3 py-2.5 ${credito.total > 0 ? "text-slate-900" : "text-slate-400"}`}>
                Crédito
                <span className="block text-[11px] leading-tight text-slate-400">
                  No entró al cajón
                </span>
              </td>
              <td
                className={`px-3 py-2.5 text-center tabular-nums ${
                  credito.total > 0 ? "text-slate-700" : "text-slate-300"
                }`}
              >
                {credito.cantidad}
              </td>
              <td
                className={`px-3 py-2.5 text-right font-medium tabular-nums ${
                  credito.total > 0 ? "text-slate-900" : "text-slate-300"
                }`}
              >
                {formatGs(credito.total)}
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr style={{ backgroundColor: TINTA }} className="text-white">
            <td className="px-3 py-3 text-sm font-bold" colSpan={2}>
              Total del día
            </td>
            <td className="px-3 py-3 text-right text-base font-bold tabular-nums">
              {formatGs(totalDia)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
