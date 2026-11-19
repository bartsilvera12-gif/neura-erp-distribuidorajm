"use client";

import useSWR from "swr";
import { getCompras } from "@/lib/compras/storage";
import type { Compra } from "@/lib/compras/types";

/** Hook compartido para la lista de compras. */
export function useCompras() {
  // getCompras devuelve { compras, error }: hay que sacar la lista. Antes se guardaba el objeto
  // entero y la pantalla de Compras (celular/tablet) rompía con "compras.reduce is not a function".
  // La clave lleva "v2" para descartar lo que el navegador tenía guardado con el formato viejo.
  const swr = useSWR<Compra[]>(
    "compras:lista:v2",
    async () => {
      const r = await getCompras();
      if (r.error) throw new Error(r.error);
      return r.compras;
    },
    {
      revalidateOnFocus: true,
      dedupingInterval: 30_000,
      keepPreviousData: true,
    },
  );
  return {
    compras: Array.isArray(swr.data) ? swr.data : [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
