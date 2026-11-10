"use client";

import useSWR from "swr";
import { getArqueo, type Arqueo } from "@/lib/cajas/arqueo";

/**
 * Arqueo. `fecha` en YYYY-MM-DD; vacío = hoy.
 *
 * Por defecto trae solo la caja propia —la que está usando quien mira— porque
 * es lo que necesita el vendedor. Con `todas` trae la lista del día entero.
 */
export function useArqueo(fecha?: string, todas = false) {
  const swr = useSWR<Arqueo>(
    `cajas:arqueo:${fecha ?? "hoy"}:${todas ? "todas" : "mia"}`,
    () => getArqueo(fecha, todas),
    // En vivo: las ventas nuevas aparecen solas mientras el arqueo está abierto.
    { revalidateOnFocus: true, dedupingInterval: 15_000, refreshInterval: 60_000, keepPreviousData: true }
  );
  return {
    arqueo: swr.data ?? null,
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
