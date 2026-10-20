"use client";

import { useEffect, useRef } from "react";
import type { Producto } from "@/lib/inventario/types";

/**
 * Lector de código de barras (los USB de caja). El lector "escribe" el código
 * como si fuera un teclado, muy rápido, y termina con Enter.
 */

/** Si el producto coincide con lo buscado: por nombre, SKU o código de barras. */
export function coincideBusqueda(p: Producto, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return (
    String(p.nombre ?? "").toLowerCase().includes(t) ||
    String(p.sku ?? "").toLowerCase().includes(t) ||
    String(p.codigo_barras ?? "").toLowerCase().includes(t)
  );
}

/**
 * Cuando la búsqueda no encuentra nada con stock: si el producto existe pero
 * está en cero, decirlo. "Ningún producto coincide" hacía creer que la caja
 * no buscaba por código.
 */
export function textoSinResultado(productos: Producto[], q: string): string {
  const t = q.trim();
  const sinStock = productos.filter((p) => p.stock_actual <= 0 && coincideBusqueda(p, t));
  if (sinStock.length === 0) return `Ningún producto coincide con “${t}”.`;
  const nombres = sinStock.slice(0, 3).map((p) => p.nombre).join(", ");
  return `${nombres}${sinStock.length > 3 ? ` y ${sinStock.length - 3} más` : ""}: sin stock para vender acá (stock 0).`;
}

/** El producto de un código: por código de barras exacto, o por SKU. */
export function productoPorCodigo(productos: Producto[], codigo: string): Producto | null {
  const c = codigo.trim();
  if (!c) return null;
  const porBarras = productos.find((p) => String(p.codigo_barras ?? "").trim() === c);
  if (porBarras) return porBarras;
  const cl = c.toLowerCase();
  return productos.find((p) => String(p.sku ?? "").trim().toLowerCase() === cl) ?? null;
}

/**
 * Escaneos hechos sin el cursor en un campo de texto: si llegan varias teclas
 * seguidas en menos de 50 ms cada una y después Enter, es el lector y no una
 * persona. Así se puede escanear sin hacer clic antes en el buscador.
 */
export function useLectorGlobal(onCodigo: (codigo: string) => void) {
  const buffer = useRef("");
  const ultima = useRef(0);
  const cb = useRef(onCodigo);
  useEffect(() => {
    cb.current = onCodigo;
  }, [onCodigo]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const enCampo =
        t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (enCampo || e.ctrlKey || e.metaKey || e.altKey) return;

      const ahora = Date.now();
      if (ahora - ultima.current > 50) buffer.current = "";
      ultima.current = ahora;

      if (e.key === "Enter") {
        const codigo = buffer.current;
        buffer.current = "";
        if (codigo.length >= 4) {
          e.preventDefault();
          cb.current(codigo);
        }
        return;
      }
      if (e.key.length === 1) buffer.current += e.key;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
