"use client";

import { useState } from "react";
import { corregirPagosVenta } from "@/lib/ventas/storage";
import { MEDIOS_MIXTO, type MedioMixto, type Venta } from "@/lib/ventas/types";

const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString("es-PY")}`;

/**
 * Corregir cómo se cobró una venta ya hecha (medios e importes) sin anularla.
 * El total no cambia: los importes tienen que sumar lo cobrado. Pide el motivo
 * y el sistema deja registrado quién, cuándo y de qué a qué se corrigió.
 */
export default function ModalEditarPagoVenta({
  venta,
  onCerrar,
  onGuardado,
}: {
  venta: Venta;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const inicial: Record<MedioMixto, string> = { efectivo: "", transferencia: "", cheque: "" };
  if (venta.pagos_detalle && venta.pagos_detalle.length > 0) {
    for (const p of venta.pagos_detalle) inicial[p.medio] = String(Math.round(p.monto));
  } else if (venta.metodo_pago === "efectivo" || venta.metodo_pago === "transferencia" || venta.metodo_pago === "cheque") {
    inicial[venta.metodo_pago] = String(Math.round(venta.total));
  }

  const [montos, setMontos] = useState<Record<MedioMixto, string>>(inicial);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suma = MEDIOS_MIXTO.reduce((s, m) => s + (Number(montos[m.value]) || 0), 0);
  const diferencia = Math.round(venta.total) - Math.round(suma);

  async function guardar() {
    if (guardando) return;
    if (!motivo.trim()) {
      setError("Escribí el motivo de la corrección.");
      return;
    }
    setGuardando(true);
    setError(null);
    const pagos = MEDIOS_MIXTO.map((m) => ({ medio: m.value as string, monto: Number(montos[m.value]) || 0 })).filter(
      (p) => p.monto > 0
    );
    const res = await corregirPagosVenta(venta.id, pagos, motivo.trim());
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onGuardado();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <h2 className="text-base font-bold text-slate-900">Corregir pago de {venta.numero_control}</h2>
        <p className="mt-1 text-sm text-slate-500">
          Total de la venta: <span className="font-semibold">{gs(venta.total)}</span>. Los importes tienen que sumar ese
          total. La caja se corrige y queda registrado el cambio.
        </p>

        <div className="mt-4 space-y-3">
          {MEDIOS_MIXTO.map((m) => (
            <label key={m.value} className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">{m.label}</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={montos[m.value]}
                onChange={(e) => setMontos((prev) => ({ ...prev, [m.value]: e.target.value }))}
                aria-label={`Importe en ${m.label}`}
                placeholder="0"
                className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm tabular-nums outline-none focus:ring-2 focus:ring-[#4FAEB2]"
              />
            </label>
          ))}
        </div>

        <p className={`mt-3 text-xs font-medium ${diferencia === 0 ? "text-emerald-700" : "text-amber-700"}`}>
          Suma: {gs(suma)}
          {diferencia === 0 ? " · coincide con el total" : ` · ${diferencia > 0 ? "faltan" : "sobran"} ${gs(Math.abs(diferencia))}`}
        </p>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Motivo de la corrección</span>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: se cargaron mal los importes"
            className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
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
            onClick={guardar}
            disabled={guardando || diferencia !== 0 || suma <= 0}
            className="flex-1 rounded-xl bg-[#4FAEB2] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar corrección"}
          </button>
        </div>
      </div>
    </div>
  );
}
