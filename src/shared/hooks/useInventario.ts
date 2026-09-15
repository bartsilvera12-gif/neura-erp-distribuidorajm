"use client";

import useSWR from "swr";
import { getProductos } from "@/lib/inventario/storage";
import type { Producto } from "@/lib/inventario/types";

/**
 * Lista de productos.
 *
 * Con `repartoId`, el stock que trae es el del camión de ese reparto y no el de
 * la empresa. La caja lo usa así para que en la calle solo se pueda vender lo
 * que está arriba del camión.
 */
export function useProductos(repartoId?: string | null) {
  const swr = useSWR<Producto[]>(
    repartoId ? `inventario:productos:reparto:${repartoId}` : "inventario:productos",
    () => getProductos(repartoId),
    {
      revalidateOnFocus: true,
      dedupingInterval: 30_000,
      keepPreviousData: true,
    }
  );
  return {
    productos: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
