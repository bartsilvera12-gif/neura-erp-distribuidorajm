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
  const swr = useSWR<{ productos: Producto[]; origen: OrigenCatalogo; error?: string }>(
    repartoId ? `caja:catalogo:reparto:${repartoId}` : "caja:catalogo",
    // Un corte (señal del celular, el servidor reiniciando) se lanza como
    // error y no como "lista vacía": así SWR conserva la lista que ya estaba
    // en pantalla y vuelve a intentar solo. Antes el corte reemplazaba la
    // lista por una vacía y la caja quedaba sin productos hasta recargar.
    async () => {
      const r = await getProductosConOrigen(repartoId);
      if (r.error) throw new Error(r.error);
      return r;
    },
    {
      errorRetryCount: 5,
      errorRetryInterval: 3_000,
      revalidateOnFocus: true,
      // Cada impresión de ticket devuelve el foco a la página: sin esto, el
      // catálogo entero se volvía a pedir después de casi cada venta.
      focusThrottleInterval: 120_000,
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
    /**
     * Falla del servidor al traer el catálogo. Va aparte de `error` de SWR
     * porque la consulta "sale bien" devolviendo una lista vacía: sin esto, un
     * 500 se ve igual que no tener stock.
     */
    // Solo si no hay ninguna lista para mostrar: con una lista ya cargada, un
    // corte momentáneo no frena la venta (el servidor igual controla el stock).
    errorCatalogo: swr.data ? null : swr.error ? (swr.error as Error).message : null,
    /** Vuelve a pedir el catálogo ahora (botón «Reintentar»). */
    reintentar: () => void swr.mutate(),
    mutate: swr.mutate,
  };
}
