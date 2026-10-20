/**
 * Tipos de comprobante de una compra y el prefijo del número que genera el
 * sistema cuando el proveedor no da uno (una remisión, por ejemplo).
 */
export const TIPOS_COMPROBANTE_COMPRA = [
  { valor: "Factura", prefijo: "FAC" },
  { valor: "Remisión", prefijo: "REM" },
  { valor: "Boleta", prefijo: "BOL" },
  { valor: "Ticket", prefijo: "TIC" },
  { valor: "Otro", prefijo: "OTR" },
] as const;

export type TipoComprobanteCompra = (typeof TIPOS_COMPROBANTE_COMPRA)[number]["valor"];

export function prefijoComprobante(tipo: string): string | null {
  return TIPOS_COMPROBANTE_COMPRA.find((t) => t.valor === tipo)?.prefijo ?? null;
}
