/**
 * Descuento sobre el total de una venta (por ejemplo, 2% a un cliente que
 * compra por mayor). Compartido entre la caja y el servidor: las dos partes
 * hacen la misma cuenta y llegan al mismo número.
 *
 * El descuento se reparte entre las líneas, en proporción a lo que vale cada
 * una, y cada línea queda en guaraníes enteros. Así la venta, la factura, el
 * IVA y lo que entra a la caja muestran todos el importe realmente cobrado,
 * sin un renglón aparte que nadie más sepa leer.
 */

export type TipoDescuento = "porcentaje" | "monto";

/**
 * Tope del descuento sobre el total. La distribuidora suele dar 5% o 6%; el
 * tope de 10% deja margen y frena un error de tipeo (20 en vez de 2).
 */
export const DESCUENTO_MAX_PORCENTAJE = 10;

/** Lo que se descuenta, en guaraníes enteros. */
export function montoDescuento(total: number, tipo: TipoDescuento, valor: number): number {
  if (!(total > 0) || !(valor > 0)) return 0;
  const monto = tipo === "porcentaje" ? (total * valor) / 100 : valor;
  return Math.max(0, Math.min(Math.round(monto), Math.round(total)));
}

/** Por qué un descuento no vale, o `null` si está bien. */
export function errorDescuento(total: number, monto: number): string | null {
  if (!Number.isFinite(monto) || monto < 0) return "El descuento no es válido.";
  if (monto === 0) return null;
  if (monto >= total) return "El descuento no puede ser todo el total.";
  if (monto > (total * DESCUENTO_MAX_PORCENTAJE) / 100 + 1) {
    return `El descuento no puede pasar del ${DESCUENTO_MAX_PORCENTAJE}% del total.`;
  }
  return null;
}

/** Porcentaje que representa el monto (con hasta 2 decimales), para mostrar y guardar. */
export function porcentajeDe(total: number, monto: number): number {
  if (!(total > 0)) return 0;
  return Math.round((monto / total) * 10000) / 100;
}

function ivaContenido(tipo: string, importe: number): number {
  if (tipo === "EXENTA") return 0;
  if (tipo === "5%") return importe / 21;
  return importe / 11;
}

type LineaConImportes = {
  cantidad: number;
  precio_venta: number;
  tipo_iva: string;
  subtotal: number;
  monto_iva: number;
  total_linea: number;
};

/**
 * Las líneas con el descuento repartido. La última se lleva el redondeo, así
 * la suma da exactamente `total − monto`. El precio unitario queda como el
 * total de la línea dividido la cantidad; el precio de lista sigue en
 * `precio_venta_original`.
 */
export function aplicarDescuento<T extends LineaConImportes>(lineas: T[], monto: number): T[] {
  const total = lineas.reduce((s, l) => s + l.total_linea, 0);
  if (!(monto > 0) || !(total > 0)) return lineas;
  let restante = Math.round(monto);
  // La última línea con importe absorbe la diferencia.
  let ultima = -1;
  lineas.forEach((l, i) => {
    if (l.total_linea > 0) ultima = i;
  });
  return lineas.map((l, i) => {
    if (!(l.total_linea > 0)) return l;
    const parte = i === ultima ? restante : Math.round((monto * l.total_linea) / total);
    restante -= parte;
    const totalLinea = Math.round(l.total_linea - parte);
    return {
      ...l,
      precio_venta: l.cantidad > 0 ? totalLinea / l.cantidad : l.precio_venta,
      subtotal: totalLinea,
      monto_iva: ivaContenido(l.tipo_iva, totalLinea),
      total_linea: totalLinea,
    };
  });
}

/** Texto que queda en la venta: «Descuento 2% (Gs. 52.000)». */
export function textoDescuento(total: number, monto: number): string {
  const pct = porcentajeDe(total, monto);
  return `Descuento ${pct.toLocaleString("es-PY")}% (Gs. ${Math.round(monto).toLocaleString("es-PY")}) sobre Gs. ${Math.round(total).toLocaleString("es-PY")}`;
}
