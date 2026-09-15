"use client";

import useSWR from "swr";
import { getCamiones, getObjetivos, getRepartidores, getRepartos } from "@/lib/repartos/storage";
import type { Camion, ObjetivoCamion, RepartidorReparto, Reparto } from "@/lib/repartos/types";

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

/**
 * Objetivo, remanente y sugerido de cada producto para un camión.
 *
 * El "remanente" es el stock real de la ubicación del camión, así que este
 * mismo hook sirve para ver qué hay arriba y para preparar la carga.
 */
export function useObjetivos(camionId: string | null) {
  const swr = useSWR<ObjetivoCamion[]>(
    camionId ? `repartos:objetivos:${camionId}` : null,
    () => getObjetivos(camionId as string),
    { revalidateOnFocus: true, dedupingInterval: 15_000, keepPreviousData: true }
  );
  return {
    objetivos: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}

/** Quién puede salir con un camión, con los ids que el alta de reparto acepta. */
export function useRepartidores() {
  const swr = useSWR<RepartidorReparto[]>(
    "repartos:repartidores",
    () => getRepartidores(),
    { revalidateOnFocus: false, dedupingInterval: 2 * 60_000, keepPreviousData: true }
  );
  return {
    repartidores: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
  };
}
