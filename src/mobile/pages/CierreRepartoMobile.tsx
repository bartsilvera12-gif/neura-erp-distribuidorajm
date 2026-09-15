"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useCierreReparto } from "@/shared/hooks/useCierreReparto";
import { formatGs } from "@/shared/caja/useCajaVenta";
import { fechaLarga, hoyEnAsuncion, TEAL } from "@/shared/caja/arqueo-ui";
import { AvisoMercaderia, AvisoSinPagos } from "@/shared/caja/cierre-ui";
import ControlMercaderia from "@/shared/caja/ControlMercaderia";
import { useRepartos } from "@/shared/hooks/useRepartos";

/**
 * Cierre de reparto mobile: lo vendido y lo cobrado en el día.
 *
 * Van en bloques separados a propósito. Una venta a crédito factura hoy y se
 * cobra otro día, y un pago de hoy puede ser de una venta de la semana pasada:
 * sumar los dos totales daría un número que no significa nada.
 */
export default function CierreRepartoMobile() {
  const [fecha, setFecha] = useState(hoyEnAsuncion());
  const { cierre, isLoading, mutate } = useCierreReparto(fecha);
  const { repartos, disponible: repartosDisponibles, mutate: refrescarRepartos } =
    useRepartos({ fecha });

  return (
    <div className="min-h-full bg-[#F8FAFC] pb-8">
      <header className="bg-[var(--zentra-sidebar)] px-4 pb-5 pt-3 text-white">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/ventas"
              aria-label="Volver a Caja"
              className="-ml-1 rounded-lg p-1.5 active:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="truncate text-base font-semibold">Cierre de reparto</h1>
          </div>
          <button
            type="button"
            onClick={() => mutate()}
            aria-label="Actualizar cierre"
            className="rounded-lg p-1.5 active:bg-white/10"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <input
          type="date"
          value={fecha}
          max={hoyEnAsuncion()}
          onChange={(e) => setFecha(e.target.value)}
          aria-label="Fecha del cierre"
          className="mt-3 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white [color-scheme:dark]"
        />

        <p className="mt-3 text-xs text-white/70">
          {cierre ? fechaLarga(cierre.fecha) : "Cargando…"}
        </p>
      </header>

      <div className="space-y-3 px-4 pt-4">
        <Bloque titulo="Resumen de ventas">
          <Fila label="Total facturado" valor={cierre ? formatGs(cierre.ventas.facturado) : "—"} destacado />
          <Fila label="Ventas contado" valor={cierre ? formatGs(cierre.ventas.contado) : "—"} />
          <Fila label="Ventas crédito" valor={cierre ? formatGs(cierre.ventas.credito) : "—"} />
          <Fila
            label={`Ventas anuladas${cierre && cierre.ventas.anuladas.cantidad > 0 ? ` (${cierre.ventas.anuladas.cantidad})` : ""}`}
            valor={cierre ? formatGs(cierre.ventas.anuladas.total) : "—"}
            apagado={!cierre || cierre.ventas.anuladas.cantidad === 0}
          />
        </Bloque>

        <Bloque titulo="Cobranzas">
          {cierre && !cierre.cobranzas.disponible ? (
            <AvisoSinPagos />
          ) : cierre && cierre.cobranzas.lineas.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">No hubo cobranzas este día.</p>
          ) : (
            <>
              {(cierre?.cobranzas.lineas ?? []).map((l) => (
                <Fila
                  key={l.metodo}
                  label={`${l.label} (${l.cantidad})`}
                  valor={formatGs(l.total)}
                />
              ))}
              <div className="mt-2 border-t border-slate-100 pt-2">
                <Fila
                  label="Total cobranzas"
                  valor={cierre ? formatGs(cierre.cobranzas.total) : "—"}
                  destacado
                />
              </div>
            </>
          )}
        </Bloque>

        {repartosDisponibles ? (
          repartos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
              No hubo repartos este día.
            </p>
          ) : (
            <div className="space-y-3">
              {repartos.map((r) => (
                <ControlMercaderia
                  key={r.id}
                  reparto={r}
                  onCerrado={() => {
                    refrescarRepartos();
                    mutate();
                  }}
                />
              ))}
            </div>
          )
        ) : (
          <AvisoMercaderia />
        )}

        <Link
          href="/ventas/repartos"
          className="block w-full rounded-xl border border-slate-200 bg-white py-3.5 text-center text-sm font-medium text-slate-600"
        >
          Abrir un reparto
        </Link>

        <Link
          href="/ventas/arqueo"
          className="block w-full rounded-xl py-3.5 text-center text-sm font-semibold text-white"
          style={{ backgroundColor: TEAL }}
        >
          Ver arqueo del día
        </Link>
      </div>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Fila({
  label,
  valor,
  destacado,
  apagado,
}: {
  label: string;
  valor: string;
  destacado?: boolean;
  apagado?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className={`text-sm ${apagado ? "text-slate-400" : "text-slate-500"}`}>{label}</span>
      <span
        className={`shrink-0 tabular-nums ${
          destacado
            ? "text-base font-bold text-slate-900"
            : apagado
              ? "text-sm text-slate-400"
              : "text-sm font-medium text-slate-900"
        }`}
      >
        {valor}
      </span>
    </div>
  );
}
