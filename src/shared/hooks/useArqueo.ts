"use client";

import useSWR from "swr";
import { getArqueo, type Arqueo } from "@/lib/ventas/arqueo";

/** Arqueo de caja de un día. `fecha` en YYYY-MM-DD; vacío = hoy. */
export function useArqueo(fecha?: string) {
  const swr = useSWR<Arqueo | null>(
    `ventas:arqueo:${fecha ?? "hoy"}`,
    () => getArqueo(fecha),
    { revalidateOnFocus: true, dedupingInterval: 15_000, keepPreviousData: true }
  );
  return {
    arqueo: swr.data ?? null,
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
