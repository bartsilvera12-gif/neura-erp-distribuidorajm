"use client";

import useSWR from "swr";
import { getCamiones, getRepartos } from "@/lib/repartos/storage";
import type { Camion, Reparto } from "@/lib/repartos/types";

/** Repartos de un día (`fecha`) o los abiertos (`abiertos`). */
export function useRepartos(opts?: { fecha?: string; abiertos?: boolean }) {
  const key = `repartos:${opts?.abiertos ? "abiertos" : (opts?.fecha ?? "hoy")}`;
  const swr = useSWR<{ disponible: boolean; repartos: Reparto[] }>(
    key,
    () => getRepartos(opts),
    { revalidateOnFocus: true, dedupingInterval: 15_000, keepPreviousData: true }
  );
  return {
    disponible: swr.data?.disponible ?? false,
    repartos: swr.data?.repartos ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}

/** Camiones. `todos` trae también los dados de baja, para administrarlos. */
export function useCamiones(todos = false) {
  const swr = useSWR<Camion[]>(
    `repartos:camiones:${todos ? "todos" : "activos"}`,
    () => getCamiones(todos),
    { revalidateOnFocus: false, dedupingInterval: 2 * 60_000, keepPreviousData: true }
  );
  return {
    camiones: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
