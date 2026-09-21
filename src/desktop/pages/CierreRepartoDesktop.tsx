"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useCierreReparto } from "@/shared/hooks/useCierreReparto";
import { useRepartos } from "@/shared/hooks/useRepartos";
import { fechaLarga, hoyEnAsuncion, TEAL, etiquetaCamion } from "@/shared/caja/arqueo-ui";
import { AvisoSinPagos, AvisoSinReparto } from "@/shared/caja/cierre-ui";
import ResumenCierre from "@/shared/caja/ResumenCierre";
import ControlMercaderia from "@/shared/caja/ControlMercaderia";

/**
 * Cierre de reparto desktop: la jornada de un camión.
 *
 * Los tres bloques del cierre arriba y la rendición debajo. Ventas y cobranzas
 * nunca se suman: miden cosas distintas —lo facturado hoy contra lo que entró
 * hoy—, y una venta a crédito aparece en la primera y no en la segunda.
 */
export default function CierreRepartoDesktop() {
  const [fecha, setFecha] = useState(hoyEnAsuncion());
  const { repartos, disponible: repartosDisponibles, mutate: refrescarRepartos } =
    useRepartos({ fecha });
  const [elegido, setElegido] = useState<string | null>(null);

  const repartoId = useMemo(() => {
    if (elegido && repartos.some((r) => r.id === elegido)) return elegido;
    return repartos[0]?.id ?? undefined;
  }, [elegido, repartos]);

  const { cierre, isLoading, mutate } = useCierreReparto(fecha, repartoId);
  const reparto = repartos.find((r) => r.id === repartoId) ?? null;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/ventas/repartos"
            className="mb-1 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a Repartos
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cierre de reparto</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {cierre ? fechaLarga(cierre.fecha) : "Cargando…"}
            {reparto ? ` · ${etiquetaCamion(reparto.camion)}` : ""}
            {reparto?.repartidor ? ` · ${reparto.repartidor}` : ""}
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
            className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-500 hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/ventas/arqueo"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: TEAL }}
          >
            Arqueo de caja
          </Link>
        </div>
      </header>

      {repartos.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {repartos.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setElegido(r.id)}
              className={`rounded-lg border-2 px-3 py-2 text-xs font-medium transition-colors ${
                r.id === repartoId
                  ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-slate-900"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {etiquetaCamion(r.camion)}
              {r.repartidor ? (
                <span className="block text-[11px] font-normal text-slate-500">
                  {r.repartidor}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {/* Una sola columna, todo alineado a la izquierda y uno debajo del otro.
          Con dos columnas, mientras el cierre cargaba —o si no llegaba— la de
          la izquierda quedaba vacía y la tarjeta flotaba sola a la derecha. */}
      <div className="space-y-4">
        {isLoading && !cierre ? (
          <p className="rounded-2xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-400">
            Cargando el cierre…
          </p>
        ) : cierre ? (
          <>
            <ResumenCierre cierre={cierre} />
            {!cierre.cobranzas?.disponible ? <AvisoSinPagos /> : null}
          </>
        ) : null}

        {!repartosDisponibles ? null : repartos.length === 0 ? (
          <AvisoSinReparto />
        ) : reparto ? (
          <ControlMercaderia
            reparto={reparto}
            onCerrado={() => {
              refrescarRepartos();
              mutate();
            }}
            onActualizar={() => {
              refrescarRepartos();
              mutate();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
