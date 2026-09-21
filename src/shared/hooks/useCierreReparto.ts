"use client";

import useSWR from "swr";
import { getCierreReparto, type CierreReparto } from "@/lib/ventas/cierre";

/**
 * Cierre de un día, o de un reparto puntual.
 *
 * Con `repartoId` el cierre es el de esa jornada: manda sobre la fecha, porque
 * el cierre de un reparto es el de su día y no el del calendario.
 */
export function useCierreReparto(fecha?: string, repartoId?: string) {
  const swr = useSWR<CierreReparto | null>(
    `ventas:cierre:${repartoId ?? fecha ?? "hoy"}`,
    () => getCierreReparto(fecha, repartoId),
    { revalidateOnFocus: true, dedupingInterval: 15_000, keepPreviousData: true }
  );
  return {
    cierre: swr.data ?? null,
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
