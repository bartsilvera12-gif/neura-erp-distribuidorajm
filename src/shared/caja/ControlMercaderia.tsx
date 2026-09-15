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
 * Control de mercadería de un reparto: qué salió, qué se vendió, qué volvió.
 *
 *   esperado   = cargado − vendido + devuelto
 *   diferencia = retornado − esperado
 *
 * Mientras el reparto está abierto se pueden cargar los conteos y cerrarlo.
 * Cerrado, queda de solo lectura.
 *
 * Es una sola pantalla responsive y no dos versiones: la tabla de conteo es
 * idéntica en mobile y desktop, y duplicarla solo garantizaría que una de las
 * dos se quede atrás.
 */
export default function ControlMercaderia({
  reparto,
  onCerrado,
}: {
  reparto: Reparto;
  onCerrado?: () => void;
}) {
  const abierto = reparto.estado === "abierto";

  // Conteos en edición: producto_id → { retornado, devuelto } como texto, para
  // poder distinguir "vacío" (sin contar) de "0" (contado y no volvió nada).
  const [conteos, setConteos] = useState<Record<string, { retornado: string; devuelto: string }>>(
    () =>
      Object.fromEntries(
        reparto.items.map((i) => [
          i.producto_id,
          {
            retornado: i.retornado === null ? "" : String(i.retornado),
            devuelto: String(i.devuelto ?? 0),
          },
        ])
      )
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setCampo(id: string, campo: "retornado" | "devuelto", valor: string) {
    setError(null);
    setConteos((prev) => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));
  }

  /** Filas con los números en vivo: al tipear, la diferencia se recalcula sola. */
  const filas = useMemo(
    () =>
      reparto.items.map((i) => {
        const c = conteos[i.producto_id] ?? { retornado: "", devuelto: "0" };
        const devuelto = c.devuelto.trim() === "" ? 0 : Number(c.devuelto);
        const esperado = i.cargado - i.vendido + (Number.isFinite(devuelto) ? devuelto : 0);
        const sinContar = c.retornado.trim() === "";
        const retornado = sinContar ? null : Number(c.retornado);
        const valido = retornado === null || (Number.isFinite(retornado) && retornado >= 0);
        return {
          ...i,
          devueltoEdit: devuelto,
          esperadoEdit: esperado,
          retornadoEdit: retornado,
          diferenciaEdit: retornado === null || !valido ? null : retornado - esperado,
          sinContar,
          valido,
        };
      }),
    [reparto.items, conteos]
  );

  const faltanContar = filas.filter((f) => f.sinContar).length;
  const invalidos = filas.filter((f) => !f.valido).length;
  const conDiferencia = filas.filter((f) => f.diferenciaEdit !== null && f.diferenciaEdit !== 0);

  async function handleCerrar() {
    if (guardando) return;
    if (invalidos > 0) {
      setError("Hay cantidades inválidas.");
      return;
    }
    if (faltanContar > 0) {
      setError(
        `Faltan contar ${faltanContar} ${faltanContar === 1 ? "producto" : "productos"}. ` +
          "Si no volvió nada de alguno, poné 0."
      );
      return;
    }

    setGuardando(true);
    setError(null);
    const res = await cerrarReparto(
      reparto.id,
      filas.map((f) => ({
        producto_id: f.producto_id,
        retornado: f.retornadoEdit ?? 0,
        devuelto: f.devueltoEdit,
      }))
    );
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
              {reparto.responsable ?? "Sin responsable"} ·{" "}
              {abierto ? "en la calle" : "cerrado"}
            </p>
          </div>
        </div>
        {abierto ? null : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <Check className="h-3 w-3" /> Cerrado
          </span>
        )}
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2.5 text-left font-semibold">Producto</th>
              <th className="px-3 py-2.5 text-right font-semibold">Cargado</th>
              <th className="px-3 py-2.5 text-right font-semibold">Vendido</th>
              <th className="px-3 py-2.5 text-right font-semibold">Devuelto</th>
              <th className="px-3 py-2.5 text-right font-semibold">Esperado</th>
              <th className="px-3 py-2.5 text-right font-semibold">Vuelve</th>
              <th className="px-4 py-2.5 text-right font-semibold">Dif.</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.producto_id} className="border-b border-slate-50 last:border-b-0">
                <td className="px-4 py-2.5 text-sm font-medium text-slate-900">{f.nombre}</td>
                <td className="px-3 py-2.5 text-right text-sm tabular-nums text-slate-600">
                  {cant(f.cargado, f.unidad)}
                </td>
                <td className="px-3 py-2.5 text-right text-sm tabular-nums text-slate-600">
                  {cant(f.vendido, f.unidad)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {abierto ? (
                    <input
                      inputMode="decimal"
                      value={conteos[f.producto_id]?.devuelto ?? "0"}
                      onChange={(e) => setCampo(f.producto_id, "devuelto", e.target.value)}
                      aria-label={`Devuelto por clientes de ${f.nombre}`}
                      className="h-8 w-20 rounded-lg border border-slate-200 px-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                    />
                  ) : (
                    <span className="text-sm tabular-nums text-slate-600">
                      {cant(f.devuelto, f.unidad)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-slate-700">
                  {cant(f.esperadoEdit, f.unidad)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {abierto ? (
                    <input
                      inputMode="decimal"
                      placeholder="—"
                      value={conteos[f.producto_id]?.retornado ?? ""}
                      onChange={(e) => setCampo(f.producto_id, "retornado", e.target.value)}
                      aria-label={`Cantidad que vuelve de ${f.nombre}`}
                      className={`h-8 w-20 rounded-lg border px-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-[#4FAEB2] ${
                        f.valido ? "border-slate-200" : "border-red-300 bg-red-50"
                      }`}
                    />
                  ) : (
                    <span className="text-sm tabular-nums text-slate-600">
                      {f.retornado === null ? "—" : cant(f.retornado, f.unidad)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Diferencia valor={abierto ? f.diferenciaEdit : f.diferencia} unidad={f.unidad} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="border-t border-slate-100 p-4">
        {conDiferencia.length > 0 ? (
          <p className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {conDiferencia.length}{" "}
              {conDiferencia.length === 1 ? "producto no cuadra" : "productos no cuadran"}. Una
              diferencia negativa es faltante; positiva, mercadería de más.
            </span>
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        {abierto ? (
          <button
            type="button"
            onClick={handleCerrar}
            disabled={guardando}
            className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40 sm:w-auto sm:px-6"
            style={{ backgroundColor: TEAL }}
          >
            {guardando ? "Cerrando…" : "Finalizar reparto"}
          </button>
        ) : (
          <p className="text-xs text-slate-500">
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
        )}
      </footer>
    </section>
  );
}

function Diferencia({ valor, unidad }: { valor: number | null; unidad: string }) {
  if (valor === null) {
    return <span className="text-sm text-slate-300">sin contar</span>;
  }
  if (valor === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600">
        <Check className="h-3.5 w-3.5" /> 0
      </span>
    );
  }
  return (
    <span
      className={`text-sm font-bold tabular-nums ${valor < 0 ? "text-red-600" : "text-amber-600"}`}
    >
      {valor > 0 ? "+" : ""}
      {cant(valor, unidad)}
    </span>
  );
}
