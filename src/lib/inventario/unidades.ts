/**
 * Unidades de medida y cantidades.
 *
 * Hay dos clases de producto y se venden distinto:
 *
 *  - Discretos (UNIDAD, CAJA, DOCENA…): se cuentan de a uno. Media caja no
 *    existe, así que la cantidad es entera y se maneja con botones + / −.
 *  - Pesables (KG, GR, LT, ML, METRO): se venden por lo que marca la balanza.
 *    1,350 KG es una venta normal, no un error de tipeo, y redondearla a 1 KG
 *    le regala 350 gramos al cliente en cada venta.
 *
 * El catálogo guarda el precio por unidad de medida: en un producto en KG,
 * `precio_venta` es el precio del kilo.
 */

export const UNIDADES = [
  "UNIDAD",
  "KG",
  "GR",
  "LT",
  "ML",
  "CAJA",
  "DOCENA",
  "BANDEJA",
  "PAQUETE",
  "BOLSA",
  "PAR",
  "METRO",
] as const;

/** Unidades que admiten fracción. Todo lo que no esté acá se vende entero. */
const PESABLES = new Set(["KG", "KGS", "KILO", "KILOS", "GR", "GRS", "G", "LT", "L", "LTS", "LITRO", "LITROS", "ML", "CC", "METRO", "METROS", "MT", "M"]);

/** Decimales con los que se guarda una cantidad pesada: gramos dentro del kilo. */
export const DECIMALES_PESABLE = 3;

export function esPesable(unidad?: string | null): boolean {
  return PESABLES.has((unidad ?? "").trim().toUpperCase());
}

/**
 * Deja la cantidad como se puede vender: entera si el producto es discreto,
 * con hasta tres decimales si es pesable.
 *
 * También arregla la basura de la coma flotante (0.1 + 0.2 = 0.30000000000000004),
 * que si no se arrastra al subtotal y descuadra el total por un guaraní.
 */
export function normalizarCantidad(cantidad: number, unidad?: string | null): number {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return 0;
  if (!esPesable(unidad)) return Math.floor(cantidad);
  const factor = 10 ** DECIMALES_PESABLE;
  return Math.round(cantidad * factor) / factor;
}

/**
 * Lee lo que tipeó el cajero. Acepta coma y punto porque el teclado del celular
 * ofrece una u otra según el idioma del teléfono, y en Paraguay el decimal se
 * escribe con coma.
 */
export function parseCantidad(texto: string, unidad?: string | null): number {
  const limpio = (texto ?? "").replace(",", ".").replace(/[^\d.]/g, "");
  if (limpio === "" || limpio === ".") return 0;
  return normalizarCantidad(Number(limpio), unidad);
}

/** Cantidad para mostrar: "1,35" en pesables, "3" en discretos. */
export function formatCantidad(cantidad: number, unidad?: string | null): string {
  const n = Number(cantidad) || 0;
  return n.toLocaleString("es-PY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: esPesable(unidad) ? DECIMALES_PESABLE : 0,
  });
}

/** "1,35 KG" / "3 UNIDAD". */
export function formatCantidadConUnidad(cantidad: number, unidad?: string | null): string {
  const u = (unidad ?? "").trim();
  return u ? `${formatCantidad(cantidad, u)} ${u}` : formatCantidad(cantidad, u);
}
