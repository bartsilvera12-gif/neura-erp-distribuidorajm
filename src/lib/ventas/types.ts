export type TipoIvaVenta = "EXENTA" | "5%" | "10%";
export type TipoVenta   = "CONTADO" | "CREDITO";
export type MonedaVenta = "GS" | "USD";

/**
 * Cómo paga el cliente. `credito` es el único que cambia `tipo_venta`; los otros
 * tres son todos CONTADO y se distinguen para el arqueo de caja.
 */
export type FormaPagoVenta = "efectivo" | "transferencia" | "cheque" | "credito";

export const FORMAS_PAGO: { value: FormaPagoVenta; label: string }[] = [
  { value: "efectivo",      label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "cheque",        label: "Cheque" },
  { value: "credito",       label: "Crédito" },
];

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
  monto_iva:             number;
  total_linea:           number;  // subtotal + monto_iva
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
  monto_iva: number;         // Σ monto_iva de ítems
  total:     number;         // Σ total_linea de ítems

  tipo_venta: TipoVenta;
  plazo_dias?: number;       // solo si tipo_venta === "CREDITO"

  /** Medio de cobro. Puede venir null en ventas anteriores a la columna. */
  forma_pago?: FormaPagoVenta | null;

  /** Cliente de la venta. `null` = venta sin nombre. */
  cliente_id?: string | null;
  cliente_nombre?: string | null;

  fecha: string;             // ISO string, generado automáticamente
}
