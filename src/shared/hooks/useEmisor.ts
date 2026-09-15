"use client";

import useSWR from "swr";
import { getEmisorComprobante, type EmisorComprobante } from "@/lib/ventas/comprobante";

/**
 * Datos del emisor para la cabecera del comprobante. Cambian una vez por año
 * (cuando se renueva el timbrado), así que se cachean largo.
 */
export function useEmisor() {
  const swr = useSWR<EmisorComprobante | null>(
    "facturacion:emisor",
    () => getEmisorComprobante(),
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000, keepPreviousData: true }
  );
  return { emisor: swr.data ?? null, isLoading: swr.isLoading };
}
