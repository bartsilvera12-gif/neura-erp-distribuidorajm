"use client";

import type { CierreReparto } from "@/lib/ventas/cierre";
import { BloqueCierre, FilaCierre, cant, gs } from "@/shared/caja/cierre-ui";

/** Colores Zentra para los tres bloques del cierre. */
const VENTAS = "#0B3A3D";
const COBRANZAS = "#2F7D82";
const MERCADERIA = "#C77B30";

/**
 * Resumen del cierre: ventas, cobranzas y control de mercadería.
 *
 * Los tres bloques van separados a propósito y sus totales no se suman entre
 * sí. Una venta a crédito factura hoy y se cobra otro día, y un cobro de hoy
 * puede ser de una venta de la semana pasada: un total único no significaría
 * nada.
 */
export default function ResumenCierre({ cierre }: { cierre: CierreReparto }) {
  const { ventas, cobranzas, mercaderia } = cierre;

  return (
    <div className="space-y-3">
      <BloqueCierre titulo="Resumen de ventas" color={VENTAS}>
        <FilaCierre label="Total facturado" valor={gs(ventas.facturado)} destacado />
        <FilaCierre label="Ventas contado" valor={gs(ventas.contado)} />
        <FilaCierre label="Ventas crédito" valor={gs(ventas.credito)} />
        <FilaCierre
          label={`Facturas anuladas${
            ventas.anuladas.cantidad > 0
              ? ` (${ventas.anuladas.cantidad} ${
                  ventas.anuladas.cantidad === 1 ? "anulada" : "anuladas"
                })`
              : ""
          }`}
          valor={gs(ventas.anuladas.total)}
          tono={ventas.anuladas.total > 0 ? "alerta" : undefined}
        />
      </BloqueCierre>

      <BloqueCierre titulo="Cobranzas" color={COBRANZAS}>
        {cobranzas.lineas.length === 0 ? (
          <FilaCierre label="Sin cobros registrados" valor={gs(0)} />
        ) : (
          cobranzas.lineas.map((l) => (
            <FilaCierre key={l.metodo} label={l.label} valor={gs(l.total)} />
          ))
        )}
        <FilaCierre label="Total cobranzas" valor={gs(cobranzas.total)} destacado />
      </BloqueCierre>

      {mercaderia.disponible ? (
        <BloqueCierre titulo="Control de mercadería" color={MERCADERIA}>
          {mercaderia.lineas.map((l) => (
            <div key={l.unidad || "sin-unidad"}>
              {mercaderia.lineas.length > 1 ? (
                <p className="bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {l.unidad || "Sin unidad"}
                </p>
              ) : null}
              <FilaCierre label="Stock inicial" valor={cant(l.inicial, l.unidad)} />
              <FilaCierre label="Total vendido" valor={cant(l.vendido, l.unidad)} />
              <FilaCierre label="Devoluciones" valor={cant(l.devuelto, l.unidad)} />
              <FilaCierre
                label={mercaderia.contado ? "Mercadería que regresó" : "Mercadería que regresa"}
                valor={cant(l.regresa, l.unidad)}
                destacado
              />
              <FilaCierre
                label="Diferencia"
                valor={`${l.diferencia > 0 ? "+" : ""}${cant(l.diferencia, l.unidad)}`}
                tono={l.diferencia === 0 ? "ok" : l.diferencia < 0 ? "malo" : "alerta"}
              />
            </div>
          ))}
        </BloqueCierre>
      ) : null}

      {mercaderia.disponible && !mercaderia.contado ? (
        <p className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
          La mercadería que regresa es la que el sistema espera. La diferencia sale recién al
          contar el camión, en la rendición de abajo.
        </p>
      ) : null}
    </div>
  );
}
