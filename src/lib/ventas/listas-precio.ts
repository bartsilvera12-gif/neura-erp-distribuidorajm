/**
 * Listas de precio de la caja: minorista y mayorista.
 *
 * Mayorista = precio de venta con 10% de descuento, fijo e igual para todos
 * los productos (así lo definió Distribuidora JM). Vive en un solo lugar porque
 * lo usan la pantalla —para mostrar y sumar— y el servidor —para verificar que
 * el precio que llega es el que corresponde—; si cada uno tuviera su copia, el
 * día que cambie el porcentaje una de las dos se iba a quedar atrás.
 */

export type ListaPrecio = "minorista" | "mayorista";

export const LISTAS_PRECIO: { valor: ListaPrecio; etiqueta: string }[] = [
  { valor: "minorista", etiqueta: "Minorista" },
  { valor: "mayorista", etiqueta: "Mayorista" },
];

/** Descuento del mayorista sobre el precio de venta. */
export const DESCUENTO_MAYORISTA = 0.1;

export function esListaPrecio(v: unknown): v is ListaPrecio {
  return v === "minorista" || v === "mayorista";
}

/**
 * Precio unitario en guaraníes según la lista. Redondeado a guaraní entero,
 * que es como se cobra: Gs. 60.000 → Gs. 54.000; Gs. 12.345 → Gs. 11.111.
 */
export function precioSegunLista(precioVenta: number, lista: ListaPrecio): number {
  if (lista === "mayorista") return Math.round(precioVenta * (1 - DESCUENTO_MAYORISTA));
  return precioVenta;
}
