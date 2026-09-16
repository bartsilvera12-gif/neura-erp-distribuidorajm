"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useCierreReparto } from "@/shared/hooks/useCierreReparto";
import { useRepartos } from "@/shared/hooks/useRepartos";
import { fechaCorta, hoyEnAsuncion } from "@/shared/caja/arqueo-ui";
import { AvisoSinPagos, AvisoSinReparto } from "@/shared/caja/cierre-ui";
import ResumenCierre from "@/shared/caja/ResumenCierre";
import ControlMercaderia from "@/shared/caja/ControlMercaderia";

/**
 * Cierre de reparto en el celular: la foto de la jornada de un camión.
 *
 * Arriba los tres bloques del cierre —ventas, cobranzas, mercadería— y abajo la
 * rendición, que es donde se cuenta el camión y se finaliza. El botón de
 * finalizar vive ahí y no acá: cerrar sin haber contado dejaría el control de
 * mercadería sin el único dato que no puede calcularse solo.
 *
 * Con más de un camión en la calle se elige cuál: cada reparto cierra por su
 * cuenta.
 */
export default function CierreRepartoMobile() {
  const [fecha, setFecha] = useState(hoyEnAsuncion());
  const { repartos, disponible: repartosDisponibles, mutate: refrescarRepartos } =
    useRepartos({ fecha });
  const [elegido, setElegido] = useState<string | null>(null);

  // Derivado y no estado sincronizado: si el reparto elegido desaparece al
  // cambiar de fecha, se cae solo al primero del día.
  const repartoId = useMemo(() => {
    if (elegido && repartos.some((r) => r.id === elegido)) return elegido;
    return repartos[0]?.id ?? undefined;
  }, [elegido, repartos]);

  const { cierre, isLoading, mutate } = useCierreReparto(fecha, repartoId);
  const reparto = repartos.find((r) => r.id === repartoId) ?? null;

  return (
    <div className="min-h-full bg-[#F8FAFC] pb-8">
      <header className="bg-[var(--zentra-sidebar)] px-4 pb-4 pt-3 text-white">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/"
              aria-label="Volver al inicio"
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

        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-white/10 px-3 py-2 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-white/70">Fecha:</span>
            <input
              type="date"
              value={fecha}
              max={hoyEnAsuncion()}
              onChange={(e) => setFecha(e.target.value)}
              aria-label="Fecha del cierre"
              className="bg-transparent font-semibold text-white outline-none [color-scheme:dark]"
            />
          </label>
          <span className="shrink-0 font-semibold">
            {reparto ? `Camión: ${reparto.camion}` : fechaCorta(fecha)}
          </span>
        </div>

        {repartos.length > 1 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {repartos.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setElegido(r.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  r.id === repartoId ? "bg-[#4FAEB2] text-white" : "bg-white/10 text-white/80"
                }`}
              >
                Camión {r.camion}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div className="space-y-3 px-4 pt-4">
        {isLoading && !cierre ? (
          <p className="py-10 text-center text-sm text-slate-400">Cargando…</p>
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

        <Link
          href="/ventas/arqueo"
          className="block w-full rounded-xl border border-slate-200 bg-white py-3.5 text-center text-sm font-medium text-slate-600"
        >
          Ver arqueo de caja
        </Link>
      </div>
    </div>
  );
}
