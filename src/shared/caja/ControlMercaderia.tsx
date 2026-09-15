"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Check, Truck } from "lucide-react";
import MovimientoMercaderia from "@/shared/caja/MovimientoMercaderia";
import { cerrarReparto } from "@/lib/repartos/storage";
import type { Reparto } from "@/lib/repartos/types";

const TEAL = "#4FAEB2";

/** Cantidad con su unidad, sin decimales de más. */
function cant(v: number, unidad: string): string {
  const n = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
  return unidad ? `${n} ${unidad}` : n;
}

/**
 * Rendición de ruta: qué salió, qué se vendió, qué debería estar arriba del
 * camión y qué hay realmente.
 *
 * El teórico sale del saldo de la ubicación del camión, no de una resta entre
 * columnas: así ya incluye las cargas de proveedor y las transferencias al
 * salón que hubo durante el día.
 *
 * Lo contado queda como saldo de esa ubicación: no vuelve al salón, porque
 * físicamente sigue arriba del camión y mañana es su apertura.
 */
export default function ControlMercaderia({
  reparto,
  onCerrado,
  onActualizar,
}: {
  reparto: Reparto;
  onCerrado?: () => void;
  /** Se llama después de una carga o una descarga, para releer los saldos. */
  onActualizar?: () => void;
}) {
  const abierto = reparto.estado === "abierto";
  const [accion, setAccion] = useState<"carga" | "transferencia" | null>(null);

  // Texto y no número, para distinguir "vacío" (sin contar) de "0" (contado y
  // no volvió nada).
  const [conteos, setConteos] = useState<Record<string, { contado: string; motivo: string }>>(() =>
    Object.fromEntries(
      reparto.items.map((i) => [
        i.producto_id,
        { contado: i.contado === null ? "" : String(i.contado), motivo: i.motivo ?? "" },
      ])
    )
  );
  const [merma, setMerma] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setCampo(id: string, campo: "contado" | "motivo", valor: string) {
    setError(null);
    setConteos((prev) => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));
  }

  /** Filas con los números en vivo: al tipear, la diferencia se recalcula sola. */
  const filas = useMemo(
    () =>
      reparto.items.map((i) => {
        const c = conteos[i.producto_id] ?? { contado: "", motivo: "" };
        const sinContar = c.contado.trim() === "";
        const contado = sinContar ? null : Number(c.contado);
        const valido = contado === null || (Number.isFinite(contado) && contado >= 0);
        const diferencia = contado === null || !valido ? null : contado - i.teorico;
        return {
          ...i,
          contadoEdit: contado,
          motivoEdit: c.motivo,
          diferenciaEdit: abierto ? diferencia : i.diferencia,
          sinContar,
          valido,
        };
      }),
    [reparto.items, conteos, abierto]
  );

  const faltanContar = filas.filter((f) => f.sinContar).length;
  const invalidos = filas.filter((f) => !f.valido).length;
  const conDiferencia = filas.filter((f) => f.diferenciaEdit !== null && f.diferenciaEdit !== 0);
  const sinMotivo = filas.filter(
    (f) => f.diferenciaEdit !== null && f.diferenciaEdit !== 0 && !f.motivoEdit.trim()
  );

  const mermaNum = merma.trim() === "" ? 0 : Number(merma);
  const mermaValida = Number.isFinite(mermaNum) && mermaNum >= 0;

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
    if (sinMotivo.length > 0) {
      setError(
        `Poné el motivo de la diferencia en: ${sinMotivo.map((f) => f.nombre).join(", ")}.`
      );
      return;
    }
    if (!mermaValida) {
      setError("La merma tiene que ser un número mayor o igual a 0.");
      return;
    }

    setGuardando(true);
    setError(null);
    const res = await cerrarReparto(reparto.id, {
      items: filas.map((f) => ({
        producto_id: f.producto_id,
        contado: f.contadoEdit ?? 0,
        motivo: f.motivoEdit.trim() || undefined,
      })),
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
        {abierto ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAccion(accion === "carga" ? null : "carga")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <ArrowDownToLine className="h-3.5 w-3.5" />
              Cargar
            </button>
            <button
              type="button"
              onClick={() => setAccion(accion === "transferencia" ? null : "transferencia")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <ArrowUpFromLine className="h-3.5 w-3.5" />
              Descargar
            </button>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <Check className="h-3 w-3" /> Cerrado
          </span>
        )}
      </header>

      {accion ? (
        <div className="border-b border-slate-100 bg-slate-50/60 p-3">
          <MovimientoMercaderia
            reparto={reparto}
            tipo={accion}
            onCerrar={() => setAccion(null)}
            onHecho={() => {
              setAccion(null);
              onActualizar?.();
            }}
          />
        </div>
      ) : null}

      {reparto.items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-400">
          El camión salió sin mercadería. Registrá una carga de proveedor.
        </p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {filas.map((f) => (
            <li key={f.producto_id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-slate-900">{f.nombre}</span>
                <span className="text-xs tabular-nums text-slate-500">
                  Salió {cant(f.cargado, f.unidad)} · Vendió {cant(f.vendido, f.unidad)}
                  {f.devuelto > 0 ? ` · Rechazado ${cant(f.devuelto, f.unidad)}` : ""}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs tabular-nums text-slate-600">
                  Debería haber{" "}
                  <span className="font-semibold text-slate-900">{cant(f.teorico, f.unidad)}</span>
                </span>

                {abierto ? (
                  <input
                    inputMode="decimal"
                    placeholder="Conté…"
                    value={conteos[f.producto_id]?.contado ?? ""}
                    onChange={(e) => setCampo(f.producto_id, "contado", e.target.value)}
                    aria-label={`Cantidad contada de ${f.nombre}`}
                    className={`h-9 w-24 rounded-lg border px-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-[#4FAEB2] ${
                      f.valido ? "border-slate-200" : "border-red-300 bg-red-50"
                    }`}
                  />
                ) : (
                  <span className="text-sm tabular-nums text-slate-700">
                    Contado {f.contado === null ? "—" : cant(f.contado, f.unidad)}
                  </span>
                )}

                <Diferencia valor={f.diferenciaEdit} unidad={f.unidad} />
              </div>

              {f.diferenciaEdit !== null && f.diferenciaEdit !== 0 ? (
                abierto ? (
                  <input
                    value={conteos[f.producto_id]?.motivo ?? ""}
                    onChange={(e) => setCampo(f.producto_id, "motivo", e.target.value)}
                    placeholder="Motivo de la diferencia (obligatorio)"
                    aria-label={`Motivo de la diferencia de ${f.nombre}`}
                    className={`mt-2 h-9 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2] ${
                      f.motivoEdit.trim() ? "border-slate-200" : "border-amber-300 bg-amber-50"
                    }`}
                  />
                ) : f.motivo ? (
                  <p className="mt-1 text-xs italic text-slate-500">{f.motivo}</p>
                ) : null
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <footer className="border-t border-slate-100 p-4">
        {conDiferencia.length > 0 ? (
          <p className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {conDiferencia.length}{" "}
              {conDiferencia.length === 1 ? "producto no cuadra" : "productos no cuadran"}.
              Negativo es faltante; positivo, mercadería de más. Al cerrar, el sistema se queda
              con lo que contaste y deja el ajuste registrado.
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
              . Lo contado quedó como saldo del camión y es su apertura de mañana.
            </p>
          </div>
        )}
      </footer>
    </section>
  );
}

function Diferencia({ valor, unidad }: { valor: number | null; unidad: string }) {
  if (valor === null) {
    return <span className="text-xs text-slate-300">sin contar</span>;
  }
  if (valor === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600">
        <Check className="h-3.5 w-3.5" /> Cuadra
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
