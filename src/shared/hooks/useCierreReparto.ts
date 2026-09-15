"use client";

import useSWR from "swr";
import { getCierreReparto, type CierreReparto } from "@/lib/ventas/cierre";

/** Cierre de reparto de un día. `fecha` en YYYY-MM-DD; vacío = hoy. */
export function useCierreReparto(fecha?: string) {
  const swr = useSWR<CierreReparto | null>(
    `ventas:cierre:${fecha ?? "hoy"}`,
    () => getCierreReparto(fecha),
    { revalidateOnFocus: true, dedupingInterval: 15_000, keepPreviousData: true }
  );
  return {
    cierre: swr.data ?? null,
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
