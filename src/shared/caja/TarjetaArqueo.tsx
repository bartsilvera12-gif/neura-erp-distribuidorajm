"use client";

import { useState } from "react";
import { Check, Coins, Lock, Unlock } from "lucide-react";
import { guardarSencillo } from "@/lib/cajas/storage";
import { formatGs } from "@/shared/caja/useCajaVenta";
import { fechaLarga, horaCorta, iconoMedio } from "@/shared/caja/arqueo-ui";
import type { ArqueoCaja } from "@/lib/cajas/arqueo";

/**
 * Arqueo de una caja: con cuánto abrió, qué entró y por qué medio, qué salió, y
 * cuánto debería haber en efectivo.
 *
 * El esperado es solo de efectivo a propósito: lo cobrado con tarjeta o
 * transferencia no está en el cajón, así que contarlo ahí haría que nunca
 * cuadre.
 */
export default function TarjetaArqueo({
  caja,
  onCambio,
}: {
  caja: ArqueoCaja;
  /** Para recargar el arqueo después de cargar el sencillo. */
  onCambio?: () => void;
}) {
  const abierta = caja.estado === "abierta";
  const dif = caja.efectivo.diferencia;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${
              abierta ? "bg-[#4FAEB2]/10 text-[#4FAEB2]" : "bg-slate-100 text-slate-500"
            }`}
          >
            {abierta ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Caja {caja.numero_caja}</p>
            <p className="text-xs text-slate-500">
              Abrió {horaCorta(caja.fecha_apertura)}
              {caja.fecha_cierre ? ` · cerró ${horaCorta(caja.fecha_cierre)}` : " · abierta"}
            </p>
          </div>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            abierta ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
          }`}
        >
          {abierta ? "Abierta" : "Cerrada"}
        </span>
      </header>

      <div className="p-4">
        <Fila label="Monto de apertura" valor={formatGs(caja.monto_apertura)} />
        <FilaSencillo caja={caja} abierta={abierta} onCambio={onCambio} />

        {caja.ingresos.por_medio.length > 0 ? (
          <>
            <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
              Ingresos
            </p>
            {caja.ingresos.por_medio.map((m) => {
              const Icono = iconoMedio(m.medio);
              return (
                <div key={m.medio} className="flex items-center justify-between gap-3 py-1">
                  <span className="flex min-w-0 items-center gap-2 text-sm text-slate-500">
                    <Icono className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">
                      {m.label}{" "}
                      <span className="text-xs text-slate-400">
                        ({m.cantidad})
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-slate-900">
                    {formatGs(m.total)}
                  </span>
                </div>
              );
            })}
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-400">Todavía no hubo ingresos.</p>
        )}

        {caja.salidas.total > 0 ? (
          <Fila
            label={`Egresos y retiros (${caja.salidas.cantidad})`}
            valor={`− ${formatGs(caja.salidas.total)}`}
          />
        ) : null}
        {caja.ajustes.total > 0 ? (
          <Fila label={`Ajustes (${caja.ajustes.cantidad})`} valor={formatGs(caja.ajustes.total)} />
        ) : null}

        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-900">Esperado en efectivo</span>
            <span className="text-xl font-bold tabular-nums text-slate-900">
              {formatGs(caja.efectivo.esperado)}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Solo efectivo: lo cobrado con tarjeta o transferencia no está en el cajón.
          </p>
        </div>

        {caja.efectivo.contado !== null ? (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <Fila label="Contado al cerrar" valor={formatGs(caja.efectivo.contado)} />
            <div className="flex items-center justify-between gap-3 py-1">
              <span className="text-sm text-slate-500">Diferencia</span>
              {dif === null ? (
                <span className="text-sm text-slate-400">—</span>
              ) : dif === 0 ? (
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600">
                  <Check className="h-3.5 w-3.5" /> Cuadra
                </span>
              ) : (
                <span
                  className={`text-sm font-bold tabular-nums ${
                    dif < 0 ? "text-red-600" : "text-amber-600"
                  }`}
                >
                  {dif > 0 ? "+" : ""}
                  {formatGs(dif)}
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            La caja sigue abierta: el conteo y la diferencia salen al cerrarla.
          </p>
        )}
      </div>
    </section>
  );
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="shrink-0 text-sm font-medium tabular-nums text-slate-900">{valor}</span>
    </div>
  );
}

export { fechaLarga };

/**
 * Sencillo y monedas: el cambio que el cajero tiene en el cajón y que no
 * entra por ventas. Suma al esperado; con la caja abierta se puede cargar.
 */
function FilaSencillo({
  caja,
  abierta,
  onCambio,
}: {
  caja: ArqueoCaja;
  abierta: boolean;
  onCambio?: () => void;
}) {
  const actual = caja.sencillo ?? 0;
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    const n = Number(valor.replace(/\D/g, "") || "0");
    setGuardando(true);
    setError(null);
    const res = await guardarSencillo(caja.id, n);
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setEditando(false);
    onCambio?.();
  }

  if (editando) {
    return (
      <div className="py-1.5">
        <span className="mb-1 flex items-center gap-1.5 text-sm text-slate-500">
          <Coins className="h-3.5 w-3.5 text-slate-400" />
          Sencillo y monedas (cambio)
        </span>
        <div className="flex gap-2">
          <input
            autoFocus
            inputMode="numeric"
            value={valor ? Number(valor.replace(/\D/g, "") || "0").toLocaleString("es-PY") : ""}
            onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void guardar();
              if (e.key === "Escape") setEditando(false);
            }}
            placeholder="0"
            className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-right text-base font-semibold tabular-nums outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          />
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="h-10 rounded-lg bg-[#4FAEB2] px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            {guardando ? "…" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="h-10 rounded-lg px-3 text-sm text-slate-500 hover:bg-slate-100"
          >
            Cancelar
          </button>
        </div>
        {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="flex items-center gap-1.5 text-sm text-slate-500">
        <Coins className="h-3.5 w-3.5 text-slate-400" />
        Sencillo y monedas (cambio)
      </span>
      <span className="flex items-center gap-2">
        <span className="text-sm font-medium tabular-nums text-slate-900">{formatGs(actual)}</span>
        {abierta ? (
          <button
            type="button"
            onClick={() => {
              setValor(actual > 0 ? String(Math.round(actual)) : "");
              setEditando(true);
            }}
            className="rounded-md px-2 py-0.5 text-xs font-semibold text-[#3F8E91] hover:bg-[#4FAEB2]/10"
          >
            {actual > 0 ? "Editar" : "Cargar"}
          </button>
        ) : null}
      </span>
    </div>
  );
}
