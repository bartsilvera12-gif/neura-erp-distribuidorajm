import { formatCantidad } from "@/lib/inventario/unidades";
import {
  columnasIva,
  esFacturaLegal,
  fechaCorta,
  fechaHoraEmision,
  LOGO_FACTURA,
  miles,
  numeroFactura,
  ubicacionEmisor,
  vencimiento,
  type DatosComprobante,
} from "@/lib/ventas/comprobante";

/**
 * La factura como PDF, generada en el dispositivo, con el mismo formato A4
 * que sale por la impresora (FacturaA4): recuadro del emisor, recuadro del
 * cliente, detalle con Exentas / 5% / 10% y liquidación del IVA.
 *
 * `pdf-lib` se carga recién cuando alguien toca el botón (`await import`): son
 * varios cientos de kilobytes que no tienen por qué viajar en cada venta, y en
 * la calle la conexión es la que es.
 */

const ANCHO = 595; // A4 vertical, en puntos
const ALTO = 842;
const M = 28;

export async function comprobantePdf(d: DatosComprobante): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const negro = rgb(0, 0, 0);

  const { venta, emisor } = d;
  const legal = esFacturaLegal(emisor);
  const emision = fechaHoraEmision(venta.fecha);
  const col = columnasIva(venta);
  const credito = venta.tipo_venta === "CREDITO";
  const vence = vencimiento(venta);

  // El logo es opcional: si no se puede bajar, la factura sale sin él.
  let logo: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  try {
    const r = await fetch(LOGO_FACTURA);
    if (r.ok) logo = await doc.embedPng(await r.arrayBuffer());
  } catch {
    logo = null;
  }

  const der = ANCHO - M;
  const ancho = der - M;

  // Columnas del detalle: [x de inicio, alineación]
  const C = {
    cod: M,
    cant: M + 44,
    desc: M + 96,
    precio: M + 280,
    desc2: M + 340,
    exentas: M + 380,
    cinco: M + 438,
    diez: M + 490,
  };
  const bordesCol = [
    C.cant,
    C.desc,
    C.precio,
    C.desc2,
    C.exentas,
    C.cinco,
    C.diez,
  ];

  // El detalle se parte en hojas: cuántas líneas entran en cada una.
  const FILA = 11;
  const porHoja = 42;
  const hojas: (typeof venta.items)[] = [];
  for (let i = 0; i < Math.max(venta.items.length, 1); i += porHoja) {
    hojas.push(venta.items.slice(i, i + porHoja));
  }

  const ajustar = (t: string, max: number, size: number, bold = false) => {
    const f = bold ? negrita : normal;
    t = aWinAnsi(t);
    if (f.widthOfTextAtSize(t, size) <= max) return t;
    let s = t;
    while (s.length > 1 && f.widthOfTextAtSize(`${s}…`, size) > max)
      s = s.slice(0, -1);
    return `${s}…`;
  };

  hojas.forEach((items, h) => {
    const page = doc.addPage([ANCHO, ALTO]);
    const texto = (
      t: string,
      x: number,
      y: number,
      o: { size?: number; bold?: boolean; derecha?: boolean } = {},
    ) => {
      const size = o.size ?? 8;
      const font = o.bold ? negrita : normal;
      t = aWinAnsi(t);
      const px = o.derecha ? x - font.widthOfTextAtSize(t, size) : x;
      page.drawText(t, { x: px, y, size, font, color: negro });
    };
    const caja = (x: number, y: number, w: number, hgt: number) =>
      page.drawRectangle({
        x,
        y,
        width: w,
        height: hgt,
        borderColor: negro,
        borderWidth: 0.7,
      });
    const linea = (x1: number, y1: number, x2: number, y2: number) =>
      page.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness: 0.7,
        color: negro,
      });

    // ── Emisor ──
    let y = ALTO - M;
    const altoEmisor = 84;
    caja(M, y - altoEmisor, ancho, altoEmisor);
    const corte = der - 170;
    let tx = M + 8;
    if (logo) {
      const h = 62;
      const w = (logo.width / logo.height) * h;
      page.drawImage(logo, { x: M + 8, y: y - 10 - h, width: w, height: h });
      tx = M + 16 + w;
    }
    const titulo = legal ? "Factura" : "Comprobante de venta";
    const anchoTexto = corte - tx - 8;
    let ty = y - 14;
    texto(titulo, tx, ty, { size: 9, bold: true });
    ty -= 16;
    texto(
      ajustar(
        (
          emisor?.razon_social ??
          emisor?.nombre_fantasia ??
          "Distribuidora JM"
        ).toUpperCase(),
        anchoTexto,
        9,
      ),
      tx,
      ty,
      { size: 9 },
    );
    ty -= 11;
    for (const l of [
      emisor?.actividad_economica ?? null,
      ubicacionEmisor(emisor) || null,
      emisor?.telefono ? `Tel: ${emisor.telefono}` : null,
      emisor?.email ?? null,
    ]) {
      if (!l) continue;
      texto(ajustar(l, anchoTexto, 8.5), tx, ty, { size: 8.5 });
      ty -= 10.5;
    }
    ty = y - 14;
    const dato = (et: string, val: string) => {
      texto(et, corte, ty, { size: 9, bold: true });
      texto(val, corte + negrita.widthOfTextAtSize(aWinAnsi(et), 9) + 3, ty, {
        size: 9,
      });
      ty -= 11;
    };
    if (emisor?.ruc) dato("RUC:", emisor.ruc);
    if (legal) dato("Timbrado N°:", emisor!.timbrado_numero ?? "");
    if (legal && emisor?.timbrado_inicio_vigencia)
      dato("Inicio de vigencia:", fechaCorta(emisor.timbrado_inicio_vigencia));
    texto(titulo, corte, ty, { size: 9, bold: true });
    ty -= 11;
    dato("N°:", numeroFactura(d));

    // ── Cliente ──
    y -= altoEmisor + 6;
    const altoCliente = 58;
    caja(M, y - altoCliente, ancho, altoCliente);
    ty = y - 12;
    const campo = (
      et: string,
      val: string,
      x: number,
      yy: number,
      max: number,
    ) => {
      texto(et, x, yy, { bold: true });
      const w = negrita.widthOfTextAtSize(et, 8) + 3;
      texto(ajustar(val, max - w, 8), x + w, yy);
    };
    const anchoIzq = corte - M - 10;
    campo("Fecha y hora de emisión:", emision, M + 6, ty, anchoIzq);
    campo(
      "Cond. de venta:",
      `${credito ? "[ ] Contado   [X] Crédito" : "[X] Contado   [ ] Crédito"}`,
      corte + 6,
      ty,
      der - corte - 10,
    );
    ty -= 11;
    campo(
      "RUC/documento de identidad:",
      d.clienteRuc || "—",
      M + 6,
      ty,
      anchoIzq,
    );
    campo(
      "Cuotas:",
      credito && venta.plazo_dias ? `1 (${venta.plazo_dias} días)` : "",
      corte + 6,
      ty,
      der - corte - 10,
    );
    ty -= 11;
    campo("Nombre o razón social:", d.cliente, M + 6, ty, anchoIzq);
    campo(
      "Tipo de operación:",
      "Venta de mercadería",
      corte + 6,
      ty,
      der - corte - 10,
    );
    ty -= 11;
    campo(
      "Dirección:",
      `${d.clienteDireccion || "—"}${vence ? ` - Vencimiento: ${vence}` : ""}`,
      M + 6,
      ty,
      anchoIzq,
    );
    campo(
      "Moneda:",
      venta.moneda === "USD"
        ? `Dólar · T.C. ${miles(venta.tipo_cambio)}`
        : "Guaraní",
      corte + 6,
      ty,
      der - corte - 10,
    );
    ty -= 11;
    campo("Forma de pago:", d.formaPago, corte + 6, ty, der - corte - 10);

    // ── Detalle ──
    y -= altoCliente + 6;
    const ultima = h === hojas.length - 1;
    const pieAlto = ultima ? 62 : 0;
    const topTabla = y;
    const baseTabla = M + pieAlto + 14;
    caja(M, baseTabla, ancho, topTabla - baseTabla);
    for (const x of bordesCol) linea(x, topTabla, x, baseTabla);
    const hy = topTabla - 11;
    texto("Cod.", C.cod + 3, hy, { bold: true });
    texto("Cantidad", C.desc - 3, hy, { bold: true, derecha: true });
    texto("Descripción", C.desc + 3, hy, { bold: true });
    texto("Precio unitario", C.desc2 - 3, hy, {
      bold: true,
      derecha: true,
      size: 7,
    });
    texto("Desc.", C.exentas - 3, hy, { bold: true, derecha: true });
    texto("Exentas", C.cinco - 3, hy, { bold: true, derecha: true });
    texto("5%", C.diez - 3, hy, { bold: true, derecha: true });
    texto("10%", der - 3, hy, { bold: true, derecha: true });
    linea(M, topTabla - 15, der, topTabla - 15);

    let fy = topTabla - 26;
    for (const it of items) {
      const u = d.unidades?.[it.producto_id] ?? it.unidad_medida ?? "";
      const t = it.tipo_iva;
      texto(ajustar(it.sku ?? "", C.cant - C.cod - 6, 7), C.cod + 3, fy, {
        size: 7,
      });
      texto(formatCantidad(it.cantidad, u), C.desc - 3, fy, {
        size: 7,
        derecha: true,
      });
      texto(
        ajustar((it.producto_nombre ?? "").toUpperCase(), C.precio - C.desc - 6, 7),
        C.desc + 3,
        fy,
        { size: 7 },
      );
      texto(miles(it.precio_venta), C.desc2 - 3, fy, {
        size: 7,
        derecha: true,
      });
      texto("0", C.exentas - 3, fy, { size: 7, derecha: true });
      texto(t === "EXENTA" ? miles(it.total_linea) : "0", C.cinco - 3, fy, {
        size: 7,
        derecha: true,
      });
      texto(t === "5%" ? miles(it.total_linea) : "0", C.diez - 3, fy, {
        size: 7,
        derecha: true,
      });
      texto(
        t !== "EXENTA" && t !== "5%" ? miles(it.total_linea) : "0",
        der - 3,
        fy,
        { size: 7, derecha: true },
      );
      fy -= FILA;
    }

    if (hojas.length > 1)
      texto(`Hoja ${h + 1}/${hojas.length}`, der, M - 12, {
        size: 7,
        derecha: true,
      });
    if (!ultima) return;

    // ── Totales ──
    const pie = baseTabla;
    caja(M, pie - pieAlto, ancho, pieAlto);
    let py = pie - 11;
    texto("SUBTOTAL", M + 4, py, { bold: true });
    texto(miles(col.exentas), C.cinco - 3, py, { bold: true, derecha: true });
    texto(miles(col.cinco), C.diez - 3, py, { bold: true, derecha: true });
    texto(miles(col.diez), der - 3, py, { bold: true, derecha: true });
    linea(M, py - 4, der, py - 4);
    py -= 15;
    texto("TOTAL DE LA OPERACIÓN", M + 4, py, { bold: true });
    texto(miles(venta.total), der - 3, py, { bold: true, derecha: true });
    py -= 11;
    texto("TOTAL EN GUARANÍES", M + 4, py, { bold: true });
    texto(
      miles(
        venta.moneda === "USD" ? venta.total * venta.tipo_cambio : venta.total,
      ),
      der - 3,
      py,
      { bold: true, derecha: true },
    );
    linea(M, py - 4, der, py - 4);
    py -= 15;
    texto("LIQUIDACIÓN IVA", M + 4, py, { bold: true });
    texto("5%", M + 130, py, { bold: true });
    texto(miles(col.iva5), M + 230, py, { bold: true, derecha: true });
    texto("10%", M + 260, py, { bold: true });
    texto(miles(col.iva10), M + 360, py, { bold: true, derecha: true });
    texto("TOTAL IVA", M + 400, py, { bold: true });
    texto(miles(col.ivaTotal), der - 3, py, { bold: true, derecha: true });

    const notas = [
      emisor?.leyenda ?? null,
      legal
        ? null
        : "Documento no fiscal: falta cargar el RUC y el timbrado en Configuración → Facturación.",
    ].filter(Boolean) as string[];
    let ny = pie - pieAlto - 11;
    for (const n of notas) {
      texto(ajustar(n, ancho, 7), M, ny, { size: 7 });
      ny -= 9;
    }
  });

  const bytes = await doc.save();
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}

/**
 * Helvetica de pdf-lib solo escribe WinAnsi: un carácter fuera de eso (→, un
 * emoji en el nombre de un cliente) hace fallar el PDF entero.
 */
function aWinAnsi(t: string): string {
  return t.replace(/→/g, ">").replace(/[^\x20-\x7E\xA0-\xFF…–—‘’“”•€]/g, "?");
}

/** Nombre del archivo: el número de venta es lo que después se busca. */
export function nombreArchivoPdf(numeroControl: string): string {
  return `${numeroControl.replace(/[^\w-]+/g, "-")}.pdf`;
}
