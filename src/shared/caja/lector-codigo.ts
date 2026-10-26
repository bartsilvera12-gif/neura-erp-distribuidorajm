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

/** El SKU o el código de barras es EXACTAMENTE lo buscado. */
export function coincidenciaExacta(p: Producto, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return false;
  return (
    String(p.sku ?? "").trim().toLowerCase() === t ||
    String(p.codigo_barras ?? "").trim().toLowerCase() === t
  );
}

/**
 * Busca productos para la caja con prioridad al código exacto.
 *
 * Si lo escrito es exactamente el SKU o el código de barras de algún producto,
 * muestra SOLO ese — así un "3281" (SKU de la milanesa) no trae además un yogur
 * cuyo código de barras largo contiene 3281. Si no hay código exacto, busca
 * normal por nombre/SKU/código.
 *
 * `todos` es el catálogo completo: sirve para reconocer el código exacto aunque
 * ese producto esté sin stock en el salón (y así no ofrecer el que no era).
 */
export function buscarProductosCaja(
  conStock: Producto[],
  todos: Producto[],
  q: string
): Producto[] {
  const t = q.trim();
  if (!t) return conStock;
  const hayExacto = todos.some((p) => coincidenciaExacta(p, t));
  if (hayExacto) return conStock.filter((p) => coincidenciaExacta(p, t));
  return conStock.filter((p) => coincideBusqueda(p, t));
}

/**
 * Cuando la búsqueda no encuentra nada con stock: si el producto existe pero
 * está en cero, decirlo. "Ningún producto coincide" hacía creer que la caja
 * no buscaba por código. Si lo escrito es un código exacto, nombra ese producto
 * (el que el usuario realmente buscó), no otro que apenas lo contiene.
 */
export function textoSinResultado(productos: Producto[], q: string): string {
  const t = q.trim();
  const exactosSinStock = productos.filter((p) => p.stock_actual <= 0 && coincidenciaExacta(p, t));
  const sinStock =
    exactosSinStock.length > 0
      ? exactosSinStock
      : productos.filter((p) => p.stock_actual <= 0 && coincideBusqueda(p, t));
  if (sinStock.length === 0) return `Ningún producto coincide con “${t}”.`;
  const nombres = sinStock.slice(0, 3).map((p) => p.nombre).join(", ");
  return `${nombres}${sinStock.length > 3 ? ` y ${sinStock.length - 3} más` : ""}: sin stock para vender acá (stock 0).`;
}

/** Dígito de control EAN-13 de los primeros 12 dígitos. */
function digitoEan13(doce: string): number {
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += Number(doce[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (suma % 10)) % 10;
}

/**
 * Etiqueta de balanza (EAN-13 de peso variable): 2 + código del producto en la
 * balanza (6 dígitos) + peso en gramos (5) + control. Ej.: 2 000073 00220 6 =
 * producto 73, 0,220 kg. El código de la balanza es el SKU del producto.
 */
export function leerEtiquetaBalanza(
  productos: Producto[],
  codigo: string
): { producto: Producto; cantidad: number } | null {
  const c = codigo.trim();
  if (!/^2\d{12}$/.test(c)) return null;
  if (digitoEan13(c.slice(0, 12)) !== Number(c[12])) return null;
  const plu = String(Number(c.slice(1, 7)));
  const gramos = Number(c.slice(7, 12));
  if (!(gramos > 0)) return null;
  const producto =
    productos.find((p) => String(p.sku ?? "").trim() === plu) ??
    productos.find((p) => String(Number(String(p.sku ?? "").trim())) === plu) ??
    null;
  return producto ? { producto, cantidad: gramos / 1000 } : null;
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
