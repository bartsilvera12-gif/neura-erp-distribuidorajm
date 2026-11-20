"use client";

import { forwardRef } from "react";
import { cantidadProd } from "@/lib/cajas/por-producto";
import type { PlanillaArqueo } from "@/lib/cajas/planilla";

/** Ancho del papel térmico en mm. */
export const ANCHO_TICKET_MM = 80;

const miles = (v: number) => Math.round(v).toLocaleString("es-PY");

export type TotalesTicket = {
  debe: number;
  rinde: number;
  diferencia: number;
  efectivo: number;
};

function Fila({ a, b, fuerte = false }: { a: string; b: string; fuerte?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${fuerte ? "font-bold" : ""}`}>
      <span>{a}</span>
      <span className="tabular-nums">{b}</span>
    </div>
  );
}

function Raya() {
  return <div className="my-1.5 border-t border-dashed border-black" />;
}

/**
 * Arqueo en formato ticket de 80 mm: una sola columna, letra legible, con todos
 * los productos (cargado, devuelto, vendido), el desglose de ventas y la cuenta
 * de la caja. Se imprime sin partir en páginas (el largo se mide en pantalla).
 */
const TicketArqueo = forwardRef<
  HTMLDivElement,
  { s: PlanillaArqueo; t: TotalesTicket; titulo: string; fecha: string }
>(function TicketArqueo({ s, t, titulo, fecha }, ref) {
  const d = s.desglose;
  return (
    <div
      ref={ref}
      className="bg-white px-[3mm] py-[3mm] font-[monospace] text-[10pt] leading-[1.25] text-black"
      style={{ width: `${ANCHO_TICKET_MM}mm` }}
    >
      <div className="text-center">
        <p className="text-[12pt] font-bold uppercase">{titulo}</p>
        <p className="font-bold">ARQUEO DE CAJA N° {s.caja.numero_caja}</p>
        <p>{fecha}</p>
        {s.responsable ? <p>{s.responsable}</p> : null}
        {s.camion ? <p>Camión {s.camion}</p> : null}
      </div>
      <Raya />
      <p className="font-bold">DESGLOSE DE VENTAS</p>
      <Fila a="Total vendido" b={`Gs. ${miles(d.total)}`} fuerte />
      <Fila a="Ventas contado" b={miles(d.contado)} />
      <Fila a="Ventas crédito" b={miles(d.credito)} />
      <Fila a="Cobro efectivo" b={miles(d.cobro_efectivo)} />
      <Fila a="Cobro transferencia" b={miles(d.cobro_transferencia)} />
      {d.cobro_otros > 0 ? <Fila a="Cobro otros medios" b={miles(d.cobro_otros)} /> : null}
      <Fila a="Efectivo esperado" b={`Gs. ${miles(d.efectivo_esperado)}`} fuerte />
      <Raya />
      <p className="font-bold">PRODUCTOS</p>
      <p className="text-[8.5pt]">Cód · Producto / Carg · Dev · Vend · Monto</p>
      {s.por_producto.length === 0 ? <p>Sin productos.</p> : null}
      {s.por_producto.map((f) => (
        <div key={f.producto_id} className="mt-1" style={{ breakInside: "avoid" }}>
          <p className="break-words">
            {f.codigo} {f.producto}
          </p>
          <div className="flex justify-between gap-1 pl-2 text-[9.5pt]">
            <span>
              C {cantidadProd(f.cargada)} · D {cantidadProd(f.devuelta)} · V {cantidadProd(f.vendida)}
            </span>
            <span className="tabular-nums">{miles(f.monto)}</span>
          </div>
        </div>
      ))}
      <Fila a="TOTAL PRODUCTOS" b={miles(s.por_producto.reduce((a, f) => a + f.monto, 0))} fuerte />
      <Raya />
      <p className="font-bold">CUENTA DE LA CAJA</p>
      <Fila a="Debe rendir" b={miles(t.debe)} />
      <Fila a="Efectivo contado" b={miles(t.efectivo)} />
      <Fila a="Rinde" b={miles(t.rinde)} />
      <Fila
        a={Math.round(t.diferencia) === 0 ? "Cuadra" : t.diferencia < 0 ? "Falta" : "Sobra"}
        b={`Gs. ${miles(Math.abs(t.diferencia))}`}
        fuerte
      />
    </div>
  );
});

export default TicketArqueo;
