"use client";

import useSWR from "swr";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

const KEY = "/api/empresas/mis-permisos";

async function fetchMisPermisos(): Promise<string[]> {
  const res = await fetchWithSupabaseSession(KEY, { cache: "no-store" });
  if (!res.ok) {
    if (res.status === 401) return [];
    throw new Error("No se pudieron cargar los permisos");
  }
  const data = (await res.json().catch(() => null)) as unknown;
  return Array.isArray(data) ? (data as string[]) : [];
}

/**
 * Permisos efectivos del usuario logueado, con cache. Cambia poco (hay que
 * editar al usuario), así que no se revalida en foco.
 *
 * `puede(accion)` devuelve `null` mientras no se sabe: sirve para no esconder
 * un botón un instante y mostrarlo después (o al revés).
 */
export function useMisPermisos() {
  const swr = useSWR<string[]>(KEY, fetchMisPermisos, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const permisos = swr.data ?? null;
  return {
    permisos: permisos ?? [],
    puede: (accion: string): boolean | null => (permisos == null ? null : permisos.includes(accion)),
    isLoading: swr.isLoading,
  };
}
