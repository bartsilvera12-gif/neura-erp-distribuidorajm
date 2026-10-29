"use client";

import useSWR from "swr";
import { getCajaAbierta } from "@/lib/cajas/storage";
import type { CajaAbierta } from "@/lib/cajas/types";

/** Caja abierta de la empresa. Sin caja abierta no se puede cobrar. */
export function useCajaAbierta() {
  const swr = useSWR<{ disponible: boolean; caja: CajaAbierta | null; aperturaSugerida: number }>(
    "cajas:abierta",
    () => getCajaAbierta(),
    { revalidateOnFocus: true, dedupingInterval: 10_000, keepPreviousData: true }
  );
  return {
    caja: swr.data?.caja ?? null,
    disponible: swr.data?.disponible ?? false,
    // Efectivo del último cierre, para pre-cargar la apertura (0 si no hay).
    aperturaSugerida: swr.data?.aperturaSugerida ?? 0,
    isLoading: swr.isLoading,
    mutate: swr.mutate,
  };
}
