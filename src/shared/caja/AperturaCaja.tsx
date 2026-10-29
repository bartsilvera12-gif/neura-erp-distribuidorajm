"use client";

import { useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { abrirCaja, cerrarCaja } from "@/lib/cajas/storage";
import type { CajaAbierta } from "@/lib/cajas/types";

const TEAL = "#4FAEB2";

const gs = (n: number) => `Gs. ${n.toLocaleString("es-PY")}`;

/**
 * Apertura y cierre de caja.
 *
 * Sin caja abierta no se cobra de contado, así que esto es lo primero de la
 * mañana. El monto de apertura es el efectivo con el que arranca el cajón, y es
 * contra eso que cuadra el arqueo.
 *
 * `sugerido` es el efectivo contado en el último cierre: la apertura arranca
 * pre-cargada con eso (lo que cerró ayer arranca hoy) y el cajero lo confirma
 * o lo ajusta.
 *
 * Al cerrar se pide contar el efectivo y se muestra la diferencia contra lo que
 * el sistema esperaba. La diferencia no bloquea el cierre: esconderla no la
 * haría desaparecer, y el cajón hay que cerrarlo igual.
 */
export default function AperturaCaja({
  caja,
  onCambio,
  sugerido = 0,
}: {
  caja: CajaAbierta | null;
  onCambio: () => void;
  sugerido?: number;
}) {
  // La apertura sugerida (el cierre anterior) llega del servidor: arranca ahí si
  // ya está, y se pre-carga cuando llega, mientras el cajero no haya tocado el
  // campo. Es un ajuste de estado al cambiar una prop (patrón de React), no un
  // efecto, así que no dispara un render en cascada.
  const [tocado, setTocado] = useState(false);
  const [monto, setMonto] = useState(() => (caja === null && sugerido > 0 ? String(sugerido) : ""));
  const [sugeridoVisto, setSugeridoVisto] = useState(sugerido);
  if (sugerido !== sugeridoVisto) {
    setSugeridoVisto(sugerido);
    if (caja === null && sugerido > 0 && !tocado) setMonto(String(sugerido));
  }
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    contado: number;
    esperado: number;
    diferencia: number;
  } | null>(null);

  const valor = monto.trim() === "" ? 0 : Number(monto);
  const valido = Number.isFinite(valor) && valor >= 0;

  async function handleAbrir() {
    if (guardando) return;
    if (!valido) {
      setError("El monto tiene que ser un número mayor o igual a 0.");
      return;
    }
    setGuardando(true);
    setError(null);
    const res = await abrirCaja(valor);
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMonto("");
    onCambio();
  }

  async function handleCerrar() {
    if (guardando || !caja) return;
    if (monto.trim() === "" || !valido) {
      setError("Contá el efectivo del cajón antes de cerrar.");
      return;
    }
    setGuardando(true);
    setError(null);
    const res = await cerrarCaja(caja.id, valor);
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMonto("");
    setResultado({ contado: res.contado, esperado: res.esperado, diferencia: res.diferencia });
    onCambio();
  }

  if (resultado) {
    const cuadra = resultado.diferencia === 0;
    return (
      <div
        className={`rounded-xl border p-4 ${
          cuadra ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
        }`}
      >
        <p className={`text-sm font-semibold ${cuadra ? "text-emerald-800" : "text-amber-900"}`}>
          Caja cerrada
        </p>
        <dl className="mt-2 space-y-0.5 text-xs text-slate-700">
          <div className="flex justify-between gap-4">
            <dt>Esperado</dt>
            <dd className="tabular-nums">{gs(resultado.esperado)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Contado</dt>
            <dd className="tabular-nums">{gs(resultado.contado)}</dd>
          </div>
          <div className="flex justify-between gap-4 font-semibold">
            <dt>Diferencia</dt>
            <dd
              className={`tabular-nums ${
                cuadra ? "text-emerald-700" : resultado.diferencia < 0 ? "text-red-600" : "text-amber-700"
              }`}
            >
              {resultado.diferencia > 0 ? "+" : ""}
              {gs(resultado.diferencia)}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={() => setResultado(null)}
          className="mt-3 text-xs font-semibold text-slate-600 underline"
        >
          Abrir otra caja
        </button>
      </div>
    );
  }

  const abierta = caja !== null;

  return (
    <div
      className={`rounded-xl border p-4 ${
        abierta ? "border-slate-200 bg-white" : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex items-start gap-2.5">
        {abierta ? (
          <LockOpen className="mt-0.5 h-4 w-4 shrink-0 text-[#4FAEB2]" />
        ) : (
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        )}
        <div className="min-w-0 flex-1">
          {abierta ? (
            <>
              <p className="text-sm font-semibold text-slate-900">
                Caja N° {caja.numero_caja} abierta
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Abrió con {gs(caja.monto_apertura)}.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-amber-900">Todavía no hay caja abierta</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-900">
                No hace falta abrirla a mano: se abre sola con el primer cobro. Abrila acá solo si
                salís con cambio en el cajón, para que el arqueo lo cuente desde el arranque.
              </p>
              {sugerido > 0 ? (
                <p className="mt-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs leading-relaxed text-emerald-800">
                  Viene del cierre anterior: <span className="font-semibold">{gs(sugerido)}</span>. Lo
                  cargamos solo en “Efectivo inicial”; podés dejarlo así o ajustarlo.
                </p>
              ) : null}
            </>
          )}

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">
                {abierta ? "Efectivo contado" : "Efectivo inicial"}
              </span>
              <input
                inputMode="numeric"
                placeholder="0"
                value={monto}
                onChange={(e) => {
                  setError(null);
                  setTocado(true);
                  setMonto(e.target.value);
                }}
                aria-label={abierta ? "Efectivo contado al cerrar" : "Efectivo inicial del cajón"}
                className={`h-10 w-36 rounded-lg border bg-white px-3 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-[#4FAEB2] ${
                  valido ? "border-slate-200" : "border-red-300 bg-red-50"
                }`}
              />
            </label>
            <button
              type="button"
              onClick={abierta ? handleCerrar : handleAbrir}
              disabled={guardando}
              className="h-10 rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-40"
              style={{ backgroundColor: abierta ? "#64748B" : TEAL }}
            >
              {guardando ? "Guardando…" : abierta ? "Cerrar caja" : "Abrir caja"}
            </button>
          </div>

          {error ? (
            <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
