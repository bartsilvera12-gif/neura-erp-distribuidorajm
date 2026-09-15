"use client";

import { Banknote, CreditCard, Landmark, Receipt } from "lucide-react";
import type { FormaPagoVenta } from "@/lib/ventas/types";

/** Piezas que comparten el arqueo mobile y el desktop. */

export const TEAL = "#4FAEB2";

export const ICONOS_PAGO: Record<
  FormaPagoVenta,
  React.ComponentType<{ className?: string }>
> = {
  efectivo: Banknote,
  transferencia: Landmark,
  cheque: Receipt,
  credito: CreditCard,
};

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

/**
 * Aviso de que falta la migración: sin `forma_pago` el total del día es correcto
 * pero no hay desglose, y conviene decirlo en vez de mostrar ceros.
 */
export function AvisoSinColumna() {
  return (
    <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
      El desglose por medio de cobro necesita la columna <code>forma_pago</code>. Corré{" "}
      <code>supabase/distribuidorajm/05_forma_pago.sql</code> y las ventas nuevas van a
      aparecer clasificadas. El total del día ya es correcto.
    </p>
  );
}

/**
 * Etiqueta de las ventas sin medio de cobro (las anteriores a la columna).
 * Va como una fila más del desglose, no como nota al margen: si se listara
 * aparte, la suma de las filas visibles no daría el total del día.
 */
export const SIN_REGISTRAR_LABEL = "Sin registrar";
