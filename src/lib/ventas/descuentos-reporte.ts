/**
 * Una venta con descuento, como se lista en el cierre de caja y en el reporte
 * de descuentos: a quién, qué venta, cuánto era, cuánto se descontó, cuánto
 * se cobró y quién lo aplicó.
 */
export interface VentaConDescuento {
  venta_id: string;
  numero_venta: string;
  /** N.° de factura si la venta tiene (la electrónica o la común). */
  factura: string | null;
  fecha: string;
  cliente: string;
  ruc: string | null;
  tipo_venta: "CONTADO" | "CREDITO";
  /** Total de la venta antes del descuento. */
  original: number;
  porcentaje: number;
  monto: number;
  /** Lo cobrado (o fiado): el total de la venta. */
  cobrado: number;
  /** Quién aplicó el descuento (o quien tenía la caja). */
  usuario: string | null;
  caja_numero: number | null;
}

export function totalesDescuentos(l: VentaConDescuento[]) {
  return l.reduce(
    (t, d) => ({ cantidad: t.cantidad + 1, original: t.original + d.original, monto: t.monto + d.monto, cobrado: t.cobrado + d.cobrado }),
    { cantidad: 0, original: 0, monto: 0, cobrado: 0 }
  );
}
