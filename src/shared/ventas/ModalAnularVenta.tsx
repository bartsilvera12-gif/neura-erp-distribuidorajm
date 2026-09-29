"use client";

import { useState } from "react";
import { anularVenta } from "@/lib/ventas/storage";
import type { Venta } from "@/lib/ventas/types";

/**
 * Anular una venta: pide el motivo. Lo usan la lista de ventas del celular y la de
 * escritorio, así que anular se comporta igual en los dos lados.
 *
 * Pide el motivo. No es burocracia: la mercadería vuelve al camión y el
 * cobro sale del arqueo, así que al cerrar el día alguien va a preguntar por
 * qué, y la respuesta tiene que estar en la venta y no en la memoria de nadie.
 */
export default function ModalAnularVenta({
  venta,
  onCerrar,
  onAnulada,
}: {
  venta: Venta;
  onCerrar: () => void;
  onAnulada: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    if (guardando) return;
    setGuardando(true);
    setError(null);
    const res = await anularVenta(venta.id, motivo.trim());
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onAnulada();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <h2 className="text-base font-bold text-slate-900">Anular {venta.numero_control}</h2>
        <p className="mt-1 text-sm text-slate-500">
          La mercadería vuelve al stock (al camión, si salió de un reparto) y el cobro sale del
          arqueo. La venta queda a la vista, marcada como anulada.
        </p>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Motivo</span>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: el cliente devolvió todo"
            className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            autoFocus
          />
        </label>

        {error ? (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-600 disabled:opacity-50"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={guardando}
            className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {guardando ? "Anulando…" : "Anular venta"}
          </button>
        </div>
      </div>
    </div>
  );
}
