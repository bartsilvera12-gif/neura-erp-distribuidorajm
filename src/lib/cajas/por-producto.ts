/** Una fila del arqueo por producto: lo cargado al camión, devuelto y vendido. */
export interface FilaProducto {
  producto_id: string;
  codigo: string;
  producto: string;
  cargada: number;
  devuelta: number;
  vendida: number;
  monto: number;
}

/** Desglose de ventas de una caja: la condición de venta va separada del medio de cobro. */
export interface DesgloseVentas {
  total: number;
  contado: number;
  credito: number;
  /** Plata cobrada (ventas al contado y cobranzas) por medio de pago. */
  cobro_efectivo: number;
  cobro_transferencia: number;
  /** Tarjeta, cheque u otros: no están en el cajón ni en el banco por transferencia. */
  cobro_otros: number;
  /** Efectivo que tiene que haber en el cajón (apertura, sencillo, cobros, gastos). */
  efectivo_esperado: number;
}

export const cantidadProd = (n: number) =>
  Number(n).toLocaleString("es-PY", { maximumFractionDigits: 2 });
