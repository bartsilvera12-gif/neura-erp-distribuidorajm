"use client";

import useSWR from "swr";
import { getCobranzaCredito, type CobranzaCredito } from "@/lib/cobranzas/credito";

/** Ventas a crédito con saldo pendiente. */
export function useCobranzaCredito() {
  const swr = useSWR<CobranzaCredito>("cobranzas:credito", () => getCobranzaCredito(), {
    revalidateOnFocus: true,
    dedupingInterval: 15_000,
    keepPreviousData: true,
  });
  return {
    cobranza: swr.data ?? null,
    isLoading: swr.isLoading,
    mutate: swr.mutate,
  };
}
