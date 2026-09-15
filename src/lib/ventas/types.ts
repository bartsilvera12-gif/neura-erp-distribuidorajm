export type TipoIvaVenta = "EXENTA" | "5%" | "10%";
export type TipoVenta   = "CONTADO" | "CREDITO";
export type MonedaVenta = "GS" | "USD";

/**
 * Medio de cobro. Son los valores que acepta `ventas.metodo_pago`.
 *
 * Ojo: el crédito NO va acá. Que la venta sea a crédito lo dice `tipo_venta`,
 * y el medio con el que se cobre se registra recién cuando se cobra.
 */
export type MetodoPagoVenta = "efectivo" | "tarjeta" | "transferencia" | "cheque" | "mixto";

export const METODOS_PAGO: { value: MetodoPagoVenta; label: string }[] = [
  { value: "efectivo",      label: "Efectivo" },
  { value: "tarjeta",       label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "cheque",        label: "Cheque" },
  { value: "mixto",         label: "Mixto" },
];

/**
 * `caja_movimientos.medio_pago` usa otro vocabulario que `ventas.metodo_pago`:
 * no tiene `mixto`, tiene `otro`. Esta es la traducción entre los dos.
 */
export function medioPagoDeCaja(metodo: MetodoPagoVenta): string {
  return metodo === "mixto" ? "otro" : metodo;
}

/** Un ítem dentro de una venta (una línea de producto). */
export interface LineaVenta {
  producto_id:           string;
  producto_nombre:       string;
  sku:                   string;
  cantidad:              number;
  precio_venta_original: number;  // en la moneda elegida
  precio_venta:          number;  // siempre en GS
  tipo_iva:              TipoIvaVenta;
  subtotal:              number;  // precio_venta × cantidad
  monto_iva:             number;  // IVA CONTENIDO en el subtotal, no agregado
  total_linea:           number;  // = subtotal: el precio ya lleva el IVA
}

/** Cabecera de venta: condiciones comerciales + totales consolidados. */
export interface Venta {
  /** UUID en base de datos (antes del bloque DB-first era numérico local). */
  id:             string;
  numero_control: string;   // VTA-000001, VTA-000002, …

  items: LineaVenta[];       // 1 o más productos

  moneda:      MonedaVenta;
  tipo_cambio: number;       // 1 si moneda === "GS"

  subtotal:  number;         // Σ subtotal de ítems
  monto_iva: number;         // Σ monto_iva de ítems (IVA incluido en el precio)
  total:     number;         // Σ total_linea de ítems = subtotal

  tipo_venta: TipoVenta;
  plazo_dias?: number;       // solo si tipo_venta === "CREDITO"

  /** Medio de cobro (`ventas.metodo_pago`). */
  metodo_pago?: MetodoPagoVenta | null;

  /** Caja en la que se cobró. */
  caja_id?: string | null;

  /** Reparto del que salió la mercadería. `null` = venta de mostrador. */
  reparto_id?: string | null;

  /** Cliente de la venta. `null` = venta sin nombre. */
  cliente_id?: string | null;
  cliente_nombre?: string | null;

  fecha: string;             // ISO string, generado automáticamente
}
