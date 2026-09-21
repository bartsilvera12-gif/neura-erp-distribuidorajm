"use client";

import useSWR from "swr";
import { getCajaAbierta } from "@/lib/cajas/storage";
import type { CajaAbierta } from "@/lib/cajas/types";

/** Caja abierta de la empresa. Sin caja abierta no se puede cobrar. */
export function useCajaAbierta() {
  const swr = useSWR<{ disponible: boolean; caja: CajaAbierta | null }>(
    "cajas:abierta",
    () => getCajaAbierta(),
    { revalidateOnFocus: true, dedupingInterval: 10_000, keepPreviousData: true }
  );
  return {
    caja: swr.data?.caja ?? null,
    disponible: swr.data?.disponible ?? false,
    isLoading: swr.isLoading,
    mutate: swr.mutate,
  };
}
