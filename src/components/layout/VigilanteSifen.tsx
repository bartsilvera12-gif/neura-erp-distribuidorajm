"use client";

import { useEffect } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

const CADA_MS = 60_000;
const CLAVE = "sifen-vigilar:ultimo";

/**
 * Mientras la app está abierta, cada minuto le pide al servidor que termine
 * las facturas electrónicas de la caja que quedaron sin respuesta de la SET.
 * No muestra nada: si una tiene un problema, el aviso llega a la campanita.
 *
 * Con varias pestañas abiertas llama una sola (la marca queda en el
 * navegador); si el usuario no tiene acceso a facturación, deja de llamar.
 */
export default function VigilanteSifen() {
  useEffect(() => {
    let parado = false;

    async function vuelta() {
      if (parado) return;
      try {
        const ultimo = Number(localStorage.getItem(CLAVE) ?? 0);
        if (Date.now() - ultimo < CADA_MS - 5_000) return;
        localStorage.setItem(CLAVE, String(Date.now()));
      } catch {
        // Sin almacenamiento: llama esta pestaña igual.
      }
      try {
        const res = await fetchWithSupabaseSession("/api/facturas/sifen-vigilar", { method: "POST" });
        if (res.status === 401 || res.status === 403) parado = true;
      } catch {
        // Sin red: se reintenta en la próxima vuelta.
      }
    }

    const primera = window.setTimeout(() => void vuelta(), 15_000);
    const t = window.setInterval(() => void vuelta(), CADA_MS);
    return () => {
      parado = true;
      window.clearTimeout(primera);
      window.clearInterval(t);
    };
  }, []);
  return null;
}
