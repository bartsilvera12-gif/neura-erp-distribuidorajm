import { formatCantidad } from "@/lib/inventario/unidades";
import { esFacturaLegal, fechaHora, gs, type DatosComprobante } from "@/lib/ventas/comprobante";

/**
 * El comprobante como PDF, generado en el teléfono.
 *
 * `pdf-lib` se carga recién cuando alguien toca el botón (`await import`): son
 * varios cientos de kilobytes que no tienen por qué viajar en cada venta, y en
 * la calle la conexión es la que es.
 *
 * Media hoja A4 apaisada (A5): entra en cualquier impresora y se lee en el
 * celular sin tener que agrandar.
 */

const ANCHO = 420; // A5 apaisado, en puntos
const MARGEN = 32;

export async function comprobantePdf(d: DatosComprobante): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);

  // Alto según la cantidad de ítems: un comprobante de dos productos no tiene
  // por qué ocupar una hoja entera.
  const alto = 210 + d.venta.items.length * 16 + (d.emisor?.leyenda ? 20 : 0);
  const page = doc.addPage([ANCHO, alto]);

  const tinta = rgb(0.05, 0.09, 0.11);
  const gris = rgb(0.45, 0.5, 0.55);
  let y = alto - MARGEN;

  const texto = (
    t: string,
    opts: { x?: number; size?: number; bold?: boolean; color?: typeof tinta; derecha?: number } = {}
  ) => {
    const size = opts.size ?? 9;
    const font = opts.bold ? negrita : normal;
    const x =
      opts.derecha !== undefined ? opts.derecha - font.widthOfTextAtSize(t, size) : (opts.x ?? MARGEN);
    page.drawText(t, { x, y, size, font, color: opts.color ?? tinta });
  };
  const salto = (n = 14) => {
    y -= n;
  };

  const { fecha, hora } = fechaHora(d.venta.fecha);
  const legal = esFacturaLegal(d.emisor);
  const derecha = ANCHO - MARGEN;

  const nombre = d.emisor?.nombre_fantasia ?? d.emisor?.razon_social ?? "";
  if (nombre) {
    texto(nombre, { size: 13, bold: true });
    salto();
  }
  if (d.emisor?.ruc) {
    texto(`RUC: ${d.emisor.ruc}`, { size: 8, color: gris });
    salto(11);
  }
  if (d.emisor?.direccion) {
    texto(d.emisor.direccion, { size: 8, color: gris });
    salto(11);
  }

  salto(6);
  texto(legal ? "FACTURA" : "COMPROBANTE DE VENTA", { size: 12, bold: true });
  texto(`N.° ${d.venta.numero_control}`, { size: 9, derecha });
  salto();
  if (legal) {
    texto(`Timbrado N.°: ${d.emisor!.timbrado_numero}`, { size: 8, color: gris });
    salto(11);
  }
  texto(`${fecha}   ${hora}`, { size: 8, color: gris });
  salto(11);
  texto(`Cliente: ${d.cliente}`, { size: 9 });
  salto(16);

  // Encabezado de la tabla
  const colCant = ANCHO - MARGEN - 190;
  const colPrecio = ANCHO - MARGEN - 90;
  texto("Descripción", { size: 8, bold: true, color: gris });
  texto("Cant.", { size: 8, bold: true, color: gris, derecha: colCant });
  texto("P. Unit.", { size: 8, bold: true, color: gris, derecha: colPrecio });
  texto("Total", { size: 8, bold: true, color: gris, derecha });
  salto(4);
  page.drawLine({
    start: { x: MARGEN, y },
    end: { x: derecha, y },
    thickness: 0.5,
    color: gris,
  });
  salto(12);

  for (const it of d.venta.items) {
    const u = d.unidades?.[it.producto_id] ?? "";
    const nombreCorto =
      it.producto_nombre.length > 28 ? `${it.producto_nombre.slice(0, 27)}…` : it.producto_nombre;
    texto(nombreCorto, { size: 8 });
    texto(`${formatCantidad(it.cantidad, u)}${u ? ` ${u}` : ""}`, { size: 8, derecha: colCant });
    texto(gs(it.precio_venta), { size: 8, derecha: colPrecio });
    texto(gs(it.total_linea), { size: 8, derecha });
    salto(13);
  }

  salto(2);
  page.drawLine({
    start: { x: MARGEN, y },
    end: { x: derecha, y },
    thickness: 0.5,
    color: gris,
  });
  salto(13);
  texto("IVA incluido", { size: 8, color: gris });
  texto(gs(d.venta.monto_iva), { size: 8, color: gris, derecha });
  salto();
  texto("TOTAL A PAGAR", { size: 11, bold: true });
  texto(gs(d.venta.total), { size: 11, bold: true, derecha });
  salto();
  texto(`Forma de pago: ${d.formaPago}`, { size: 8, color: gris });

  if (d.emisor?.leyenda) {
    salto(14);
    texto(d.emisor.leyenda, { size: 7, color: gris });
  }

  const bytes = await doc.save();
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}

/** Nombre del archivo: el número de venta es lo que después se busca. */
export function nombreArchivoPdf(numeroControl: string): string {
  return `${numeroControl.replace(/[^\w-]+/g, "-")}.pdf`;
}
