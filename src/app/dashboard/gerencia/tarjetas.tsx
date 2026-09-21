"use client";

import { motion } from "framer-motion";

/**
 * Tarjetas y paneles de Gerencia, con el mismo lenguaje visual del Dashboard:
 * borde turquesa suave, cifra grande tabular, etiqueta en versalitas y el mismo
 * levante al pasar el mouse.
 *
 * Están acá y no en `components/ui/report` a propósito: ese `Kpi` lo comparten
 * Reportes y otras pantallas, y cambiarlo de fondo les movería el diseño a
 * todas sin que nadie lo haya pedido.
 */

const TEAL = "#4FAEB2";

export function TarjetaKpi({
  label,
  value,
  sub,
  subColor,
  icono,
  destacada,
}: {
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
  icono?: React.ReactNode;
  /** La cifra principal del mes: gradiente y barra superior. */
  destacada?: boolean;
}) {
  const card = destacada
    ? "relative overflow-hidden rounded-2xl border border-[#4FAEB2]/55 bg-gradient-to-br from-white via-white to-[#4FAEB2]/10 p-5 shadow-[0_4px_18px_rgba(79,174,178,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(79,174,178,0.14)]"
    : "relative overflow-hidden rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md";

  return (
    <motion.div whileHover={{ y: -2 }} className={card}>
      {destacada ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#4FAEB2] via-[#4FAEB2]/70 to-[#4FAEB2]/30"
        />
      ) : null}
      {icono ? (
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
            destacada
              ? "border-[#4FAEB2]/30 bg-[#4FAEB2]/12 text-[#4FAEB2]"
              : "border-slate-200 bg-slate-50 text-slate-500"
          }`}
        >
          {icono}
        </span>
      ) : null}
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold leading-tight tracking-tight tabular-nums text-slate-900">
        {value}
      </p>
      {sub ? <p className={`mt-1 text-[11px] ${subColor || "text-slate-500"}`}>{sub}</p> : null}
    </motion.div>
  );
}

/** Panel con título en versalitas y barrita turquesa, como los del Dashboard. */
export function PanelGerencia({
  titulo,
  bajada,
  acciones,
  children,
}: {
  titulo: string;
  bajada?: string;
  acciones?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      whileHover={{ y: -2 }}
      className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:shadow-md"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full" style={{ backgroundColor: TEAL }} />
          <div>
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TEAL }} />
              {titulo}
            </h2>
            {bajada ? <p className="mt-1 text-[11px] text-slate-500">{bajada}</p> : null}
          </div>
        </div>
        {acciones}
      </div>
      <div className="mt-5">{children}</div>
    </motion.section>
  );
}

/** Encabezado de tabla con el mismo tono que el resto. */
export const THEAD_GERENCIA =
  "border-b border-[#4FAEB2]/25 text-left text-[10px] uppercase tracking-[0.12em] text-slate-500";
