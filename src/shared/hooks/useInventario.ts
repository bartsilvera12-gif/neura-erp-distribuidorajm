"use client";

import useSWR from "swr";
import { getProductosConOrigen, type OrigenCatalogo } from "@/lib/inventario/storage";
import type { Producto } from "@/lib/inventario/types";

/**
 * Lista de productos.
 *
 * Con `repartoId`, el stock que trae es el del camión de ese reparto y no el de
 * la empresa. La caja lo usa así para que en la calle solo se pueda vender lo
 * que está arriba del camión.
 */
export function useProductos(repartoId?: string | null) {
  const swr = useSWR<{ productos: Producto[]; origen: OrigenCatalogo }>(
    repartoId ? `inventario:productos:reparto:${repartoId}` : "inventario:productos",
    () => getProductosConOrigen(repartoId),
    {
      revalidateOnFocus: true,
      dedupingInterval: 30_000,
      keepPreviousData: true,
    }
  );
  return {
    productos: swr.data?.productos ?? [],
    /** De qué stock es la lista, según el servidor. */
    origen: swr.data?.origen ?? null,
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
