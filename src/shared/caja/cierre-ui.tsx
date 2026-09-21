"use client";

import { Info } from "lucide-react";

/** Piezas que comparten el cierre mobile y el desktop. */

/** Guaraníes sin decimales, que es como se maneja la moneda. */
export function gs(n: number): string {
  return `Gs. ${Math.round(n).toLocaleString("es-PY")}`;
}

/** Cantidad con su unidad, sin decimales de más. */
export function cant(v: number, unidad: string): string {
  const n = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
  return unidad ? `${n} ${unidad}` : n;
}

/**
 * Bloque del cierre: barra de título de color y filas etiqueta/valor.
 *
 * Los tres bloques tienen su color —ventas, cobranzas, mercadería— porque el
 * cierre se lee de un vistazo al final del día y el color separa los tres
 * conceptos antes que el texto. Todos salen de la paleta Zentra.
 */
export function BloqueCierre({
  titulo,
  color,
  children,
}: {
  titulo: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <h2
        className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-white"
        style={{ backgroundColor: color }}
      >
        {titulo}
      </h2>
      <dl className="divide-y divide-slate-100">{children}</dl>
    </section>
  );
}

/** Una fila del bloque. `destacado` para el total. */
export function FilaCierre({
  label,
  valor,
  destacado = false,
  tono,
}: {
  label: string;
  valor: string;
  destacado?: boolean;
  tono?: "ok" | "alerta" | "malo";
}) {
  const color =
    tono === "ok"
      ? "text-emerald-600"
      : tono === "malo"
        ? "text-red-600"
        : tono === "alerta"
          ? "text-amber-600"
          : destacado
            ? "text-slate-900"
            : "text-slate-700";

  return (
    <div
      className={`flex items-baseline justify-between gap-4 px-3 py-2 ${
        destacado ? "bg-slate-50" : ""
      }`}
    >
      <dt className={`text-sm ${destacado ? "font-semibold text-slate-900" : "text-slate-600"}`}>
        {label}
      </dt>
      <dd className={`text-sm tabular-nums ${destacado ? "font-bold" : "font-medium"} ${color}`}>
        {valor}
      </dd>
    </div>
  );
}

/**
 * Sin reparto abierto no hay control de mercadería que mostrar: el cierre queda
 * con ventas y cobranzas del día.
 */
export function AvisoSinReparto() {
  return (
    <div className="flex gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="text-xs leading-relaxed text-slate-600">
        <p className="font-semibold text-slate-700">Sin reparto</p>
        <p className="mt-1">
          Este cierre es del día, no de un camión. Abrí un reparto para tener también el control
          de mercadería.
        </p>
      </div>
    </div>
  );
}

export function AvisoSinPagos() {
  return (
    <div className="flex gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="text-xs leading-relaxed text-slate-600">
        <p className="font-semibold text-slate-700">Cobranzas</p>
        <p className="mt-1">
          Este schema no tiene tabla de pagos, así que el cierre muestra solo lo vendido.
        </p>
      </div>
    </div>
  );
}
