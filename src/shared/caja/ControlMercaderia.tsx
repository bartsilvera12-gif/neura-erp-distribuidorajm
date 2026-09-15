"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Truck } from "lucide-react";
import { cerrarReparto } from "@/lib/repartos/storage";
import type { Reparto } from "@/lib/repartos/types";

const TEAL = "#4FAEB2";

/** Cantidad con su unidad, sin decimales de más. */
function cant(v: number, unidad: string): string {
  const n = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
  return unidad ? `${n} ${unidad}` : n;
}

/**
 * Control de mercadería de un reparto: qué salió, qué se vendió, qué rechazó el
 * cliente y qué debería volver en el camión.
 *
 *   esperado = cargado − vendido + devuelto
 *
 * La tabla es de solo lectura: los números salen de la carga y de las ventas
 * estampadas con el reparto, no de un conteo a mano. Al cerrar solo se declara
 * la merma total del día, que es lo que se controla al volver al depósito.
 *
 * Es una sola pantalla responsive y no dos versiones: la tabla es idéntica en
 * mobile y desktop, y duplicarla solo garantizaría que una se quede atrás.
 */
export default function ControlMercaderia({
  reparto,
  onCerrado,
}: {
  reparto: Reparto;
  onCerrado?: () => void;
}) {
  const abierto = reparto.estado === "abierto";

  const [merma, setMerma] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totales = useMemo(() => {
    let cargado = 0;
    let vendido = 0;
    let devuelto = 0;
    let esperado = 0;
    for (const i of reparto.items) {
      cargado += i.cargado;
      vendido += i.vendido;
      devuelto += i.devuelto;
      esperado += i.esperado;
    }
    return { cargado, vendido, devuelto, esperado };
  }, [reparto.items]);

  /** Vendido de más: el camión no puede haber vendido más de lo que cargó. */
  const sobrevendidos = reparto.items.filter((i) => i.esperado < 0);

  const mermaNum = merma.trim() === "" ? 0 : Number(merma);
  const mermaValida = Number.isFinite(mermaNum) && mermaNum >= 0;

  async function handleCerrar() {
    if (guardando) return;
    if (!mermaValida) {
      setError("La merma tiene que ser un número mayor o igual a 0.");
      return;
    }

    setGuardando(true);
    setError(null);
    const res = await cerrarReparto(reparto.id, {
      merma_kg: mermaNum,
      notas_cierre: notas.trim() || undefined,
    });
    setGuardando(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    onCerrado?.();
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4FAEB2]/10 text-[#4FAEB2]">
            <Truck className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Camión {reparto.camion}</p>
            <p className="text-xs text-slate-500">
              {reparto.repartidor ?? "Sin repartidor"} · {abierto ? "en la calle" : "cerrado"}
            </p>
          </div>
        </div>
        {abierto ? null : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <Check className="h-3 w-3" /> Cerrado
          </span>
        )}
      </header>

      <ul className="divide-y divide-slate-50 sm:hidden">
        {reparto.items.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-slate-400">
            Este reparto salió sin carga registrada.
          </li>
        ) : (
          reparto.items.map((i) => (
            <li key={i.producto_id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-sm font-medium text-slate-900">{i.nombre}</span>
                <span className="shrink-0 text-right">
                  <span className="block text-[10px] uppercase tracking-wider text-slate-400">
                    Debe volver
                  </span>
                  <span
                    className={`block text-sm font-bold tabular-nums ${
                      i.esperado < 0 ? "text-red-600" : "text-slate-900"
                    }`}
                  >
                    {cant(i.esperado, i.unidad)}
                  </span>
                </span>
              </div>
              <p className="mt-0.5 text-xs tabular-nums text-slate-500">
                Cargado {cant(i.cargado, i.unidad)} · Vendido {cant(i.vendido, i.unidad)} ·
                Rechazado {cant(i.devuelto, i.unidad)}
              </p>
            </li>
          ))
        )}
        {reparto.items.length > 0 ? (
          <li className="flex items-baseline justify-between gap-3 bg-slate-50/60 px-4 py-2.5 text-sm font-semibold text-slate-700">
            <span>Total debe volver</span>
            <span className="tabular-nums">{totales.esperado}</span>
          </li>
        ) : null}
      </ul>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2.5 text-left font-semibold">Producto</th>
              <th className="px-3 py-2.5 text-right font-semibold">Cargado</th>
              <th className="px-3 py-2.5 text-right font-semibold">Vendido</th>
              <th className="px-3 py-2.5 text-right font-semibold">Rechazado</th>
              <th className="px-4 py-2.5 text-right font-semibold">Debe volver</th>
            </tr>
          </thead>
          <tbody>
            {reparto.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                  Este reparto salió sin carga registrada.
                </td>
              </tr>
            ) : (
              reparto.items.map((i) => (
                <tr key={i.producto_id} className="border-b border-slate-50 last:border-b-0">
                  <td className="px-4 py-2.5 text-sm font-medium text-slate-900">{i.nombre}</td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums text-slate-600">
                    {cant(i.cargado, i.unidad)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums text-slate-600">
                    {cant(i.vendido, i.unidad)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums text-slate-600">
                    {cant(i.devuelto, i.unidad)}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right text-sm font-semibold tabular-nums ${
                      i.esperado < 0 ? "text-red-600" : "text-slate-800"
                    }`}
                  >
                    {cant(i.esperado, i.unidad)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {reparto.items.length > 0 ? (
            <tfoot>
              <tr className="border-t border-slate-100 bg-slate-50/60 text-sm font-semibold text-slate-700">
                <td className="px-4 py-2.5 text-left">Total</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{totales.cargado}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{totales.vendido}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{totales.devuelto}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{totales.esperado}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <footer className="border-t border-slate-100 p-4">
        {sobrevendidos.length > 0 ? (
          <p className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {sobrevendidos.length === 1
                ? "Un producto se vendió por encima de lo cargado"
                : `${sobrevendidos.length} productos se vendieron por encima de lo cargado`}
              : o salió mercadería sin registrar en la carga, o una venta quedó estampada con el
              camión equivocado.
            </span>
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        {abierto ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Merma (kg)</span>
                <input
                  inputMode="decimal"
                  placeholder="0"
                  value={merma}
                  onChange={(e) => {
                    setError(null);
                    setMerma(e.target.value);
                  }}
                  aria-label={`Merma total del camión ${reparto.camion}`}
                  className={`h-10 w-full rounded-lg border px-3 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-[#4FAEB2] ${
                    mermaValida ? "border-slate-200" : "border-red-300 bg-red-50"
                  }`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  Notas del cierre
                </span>
                <input
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Rotura en el traslado, cliente ausente…"
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={handleCerrar}
              disabled={guardando}
              className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40 sm:w-auto sm:px-6"
              style={{ backgroundColor: TEAL }}
            >
              {guardando ? "Cerrando…" : "Finalizar reparto"}
            </button>
          </div>
        ) : (
          <div className="space-y-1 text-xs text-slate-500">
            <p>
              Merma declarada:{" "}
              <span className="font-semibold text-slate-700">
                {reparto.merma_kg === null ? "—" : `${reparto.merma_kg} kg`}
              </span>
            </p>
            {reparto.notas_cierre ? <p>{reparto.notas_cierre}</p> : null}
            <p>
              Cerrado el{" "}
              {reparto.cerrado_at
                ? new Date(reparto.cerrado_at).toLocaleString("es-PY", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
              .
            </p>
          </div>
        )}
      </footer>
    </section>
  );
}
