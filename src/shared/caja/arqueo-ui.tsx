"use client";

import { Banknote, CreditCard, HelpCircle, Landmark, Receipt, Wallet } from "lucide-react";

/** Piezas que comparten el arqueo mobile y el desktop. */

export const TEAL = "#4FAEB2";

export const ICONOS_MEDIO: Record<string, React.ComponentType<{ className?: string }>> = {
  efectivo: Banknote,
  tarjeta: CreditCard,
  transferencia: Landmark,
  cheque: Receipt,
  otro: Wallet,
};

export function iconoMedio(medio: string): React.ComponentType<{ className?: string }> {
  return ICONOS_MEDIO[medio] ?? HelpCircle;
}

/** Hoy en hora de Asunción, para que el input date arranque en el día correcto. */
export function hoyEnAsuncion(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Asuncion",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function fechaLarga(iso: string): string {
  // El ISO viene como día calendario; construirlo con `new Date(iso)` lo
  // interpretaría en UTC y en Paraguay mostraría el día anterior.
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-PY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function horaCorta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" });
}

/** El schema no modela caja: sin eso no hay arqueo que hacer. */
export function AvisoSinCajas() {
  return (
    <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
      Este schema no tiene <code>cajas</code> ni <code>caja_movimientos</code>, así que no hay
      arqueo para mostrar.
    </p>
  );
}

/** Fecha corta dd/mm/aaaa, como la escribe el cierre en papel. */
export function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
