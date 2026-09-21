"use client";

import useSWR from "swr";
import { getProductos, getProductosConOrigen, type OrigenCatalogo } from "@/lib/inventario/storage";
import type { Producto } from "@/lib/inventario/types";

/**
 * Maestro de productos de la empresa, con su stock total.
 *
 * Lo usan Inventario y la carga del camión. NO se acota a ningún camión: para
 * vender está `useCatalogoVenta`.
 */
export function useProductos() {
  const swr = useSWR<Producto[]>("inventario:productos", () => getProductos(), {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
  });
  return {
    productos: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}

/**
 * Catálogo de la caja: lo que se puede vender desde donde está parado quien
 * vende. Con `repartoId`, el stock del camión de ese reparto; sin él, el del
 * salón. `origen` dice cuál de los dos, según el servidor.
 */
export function useCatalogoVenta(repartoId?: string | null) {
  const swr = useSWR<{ productos: Producto[]; origen: OrigenCatalogo }>(
    repartoId ? `caja:catalogo:reparto:${repartoId}` : "caja:catalogo",
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
