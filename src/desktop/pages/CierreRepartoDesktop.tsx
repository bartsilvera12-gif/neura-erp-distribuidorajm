"use client";

import Link from "next/link";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useCierreReparto } from "@/shared/hooks/useCierreReparto";
import { formatGs } from "@/shared/caja/useCajaVenta";
import { fechaLarga, hoyEnAsuncion, TEAL } from "@/shared/caja/arqueo-ui";
import { AvisoMercaderia, AvisoSinPagos } from "@/shared/caja/cierre-ui";
import ControlMercaderia from "@/shared/caja/ControlMercaderia";
import { useRepartos } from "@/shared/hooks/useRepartos";

/**
 * Cierre de reparto desktop. Ventas y cobranzas lado a lado, que es la
 * comparación que se hace al cerrar; nunca sumadas, porque miden cosas
 * distintas (lo facturado hoy vs. lo que entró hoy).
 */
export default function CierreRepartoDesktop() {
  const [fecha, setFecha] = useState(hoyEnAsuncion());
  const { cierre, isLoading, mutate } = useCierreReparto(fecha);
  const { repartos, disponible: repartosDisponibles, mutate: refrescarRepartos } =
    useRepartos({ fecha });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cierre de reparto</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {cierre ? fechaLarga(cierre.fecha) : "Cargando…"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fecha}
            max={hoyEnAsuncion()}
            onChange={(e) => setFecha(e.target.value)}
            aria-label="Fecha del cierre"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          />
          <button
            type="button"
            onClick={() => mutate()}
            aria-label="Actualizar cierre"
            className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-600 transition-colors hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/ventas/repartos"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Repartos
          </Link>
          <Link
            href="/ventas/arqueo"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: TEAL }}
          >
            Ver arqueo
          </Link>
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
            Resumen de ventas
          </h2>
          <Fila
            label="Total facturado"
            valor={cierre ? formatGs(cierre.ventas.facturado) : "—"}
            nota={
              cierre
                ? `${cierre.ventas.cantidad} ${cierre.ventas.cantidad === 1 ? "venta" : "ventas"}`
                : undefined
            }
            destacado
          />
          <Fila label="Ventas contado" valor={cierre ? formatGs(cierre.ventas.contado) : "—"} />
          <Fila label="Ventas crédito" valor={cierre ? formatGs(cierre.ventas.credito) : "—"} />
          <Fila
            label="Ventas anuladas"
            valor={cierre ? formatGs(cierre.ventas.anuladas.total) : "—"}
            nota={
              cierre && cierre.ventas.anuladas.cantidad > 0
                ? `${cierre.ventas.anuladas.cantidad} ${
                    cierre.ventas.anuladas.cantidad === 1 ? "anulada" : "anuladas"
                  }, fuera del facturado`
                : undefined
            }
            apagado={!cierre || cierre.ventas.anuladas.cantidad === 0}
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
            Cobranzas
          </h2>
          {cierre && !cierre.cobranzas.disponible ? (
            <AvisoSinPagos />
          ) : cierre && cierre.cobranzas.lineas.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">No hubo cobranzas este día.</p>
          ) : (
            <>
              {(cierre?.cobranzas.lineas ?? []).map((l) => (
                <Fila
                  key={l.metodo}
                  label={l.label}
                  valor={formatGs(l.total)}
                  nota={`${l.cantidad} ${l.cantidad === 1 ? "pago" : "pagos"}`}
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
        </section>
      </div>

      <div className="mt-5 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Control de mercadería
        </h2>
        {repartosDisponibles ? (
          repartos.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
              No hubo repartos este día.
            </p>
          ) : (
            repartos.map((r) => (
              <ControlMercaderia
                key={r.id}
                reparto={r}
                onCerrado={() => {
                  refrescarRepartos();
                  mutate();
                }}
              />
            ))
          )
        ) : (
          <AvisoMercaderia />
        )}
      </div>
    </div>
  );
}

function Fila({
  label,
  valor,
  nota,
  destacado,
  apagado,
}: {
  label: string;
  valor: string;
  nota?: string;
  destacado?: boolean;
  apagado?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className={`block text-sm ${apagado ? "text-slate-400" : "text-slate-500"}`}>
          {label}
        </span>
        {nota ? <span className="block text-xs text-slate-400">{nota}</span> : null}
      </span>
      <span
        className={`shrink-0 tabular-nums ${
          destacado
            ? "text-xl font-bold text-slate-900"
            : apagado
              ? "text-sm text-slate-400"
              : "text-sm font-semibold text-slate-900"
        }`}
      >
        {valor}
      </span>
    </div>
  );
}
