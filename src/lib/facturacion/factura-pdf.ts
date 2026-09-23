/**
 * Generador de PDF de factura/recibo simple (NO SIFEN).
 *
 * Se usa cuando la factura NO se firma electronicamente por SET — es el caso
 * de la Asociacion, que emite recibos de cuotas de socios sin RUC.
 *
 * El PDF es A5 vertical (~148x210mm), pensado para leer bien desde WhatsApp
 * en el celular sin hacer zoom. Tipografia embebida = Helvetica del kernel de
 * pdf-lib (no requiere archivo externo).
 */

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";

export type FacturaPdfInput = {
  factura: {
    numero_factura: string;
    fecha: string;             // YYYY-MM-DD
    fecha_vencimiento: string; // YYYY-MM-DD
    monto: number;
    saldo: number;
    estado: string;            // Pagado / Pendiente / Vencido / Anulado
    moneda: string;            // GS | USD
    tipo: string;              // contado / credito / suscripcion
    concepto?: string | null;  // "Cuota Agosto 2026" o similar; si es null se arma desde el numero
  };
  cliente: {
    nombre: string;
    documento?: string | null;  // CI o RUC
    numero_socio?: string | null;
    telefono?: string | null;
  };
  emisor: {
    nombre: string;             // "Asociacion Hernandarias Azulgrana"
    subtitulo?: string | null;  // opcional (ej. slogan / rubro)
    telefono?: string | null;
    email?: string | null;
    banco?: string | null;      // "Banco Continental"
    cuenta?: string | null;     // "1234-5678"
    titular_cuenta?: string | null;
  };
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function fmtMoney(n: number, moneda: string): string {
  const abs = Math.abs(n);
  const nf = new Intl.NumberFormat(moneda === "USD" ? "en-US" : "es-PY", {
    maximumFractionDigits: moneda === "USD" ? 2 : 0,
  });
  const s = nf.format(abs);
  return moneda === "USD" ? `USD ${s}` : `Gs. ${s}`;
}

/** Quita tildes/eñe: la fuente Helvetica de pdf-lib es WinAnsi y no tiene todo Unicode. */
function ascii(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/Ñ/g, "N")
    .replace(/ñ/g, "n");
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = rgb(0.1, 0.15, 0.25)
) {
  page.drawText(ascii(text), { x, y, size, font, color });
}

// ── Layout ───────────────────────────────────────────────────────────────────

export async function buildFacturaPdfBuffer(input: FacturaPdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  // A5 vertical: 148x210mm = 419.5 x 595.3 pt
  const page = doc.addPage([419.5, 595.3]);
  const { width, height } = page.getSize();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const teal = rgb(0.31, 0.68, 0.7); // #4FAEB2 aprox
  const slate = rgb(0.28, 0.34, 0.42);
  const slateSoft = rgb(0.55, 0.6, 0.68);

  const M = 30; // margen
  let y = height - M;

  // ── Cabecera ───────────────────────────────────────────────────────────
  // Barra teal como acento
  page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: teal });

  y -= 14;
  drawText(page, input.emisor.nombre.toUpperCase(), M, y, bold, 13, slate);
  if (input.emisor.subtitulo) {
    y -= 14;
    drawText(page, input.emisor.subtitulo, M, y, helv, 9, slateSoft);
  }

  // Titulo comprobante a la derecha
  const tituloComp = "RECIBO DE CUOTA";
  const wComp = bold.widthOfTextAtSize(tituloComp, 11);
  drawText(page, tituloComp, width - M - wComp, height - M - 14, bold, 11, teal);
  const numFact = `N° ${input.factura.numero_factura}`;
  const wNum = helv.widthOfTextAtSize(numFact, 9);
  drawText(page, numFact, width - M - wNum, height - M - 28, helv, 9, slateSoft);

  y -= 24;
  page.drawLine({
    start: { x: M, y },
    end: { x: width - M, y },
    thickness: 0.8,
    color: rgb(0.87, 0.9, 0.94),
  });

  // ── Bloque cliente ─────────────────────────────────────────────────────
  y -= 20;
  drawText(page, "SOCIO", M, y, bold, 8, slateSoft);
  y -= 14;
  drawText(page, input.cliente.nombre, M, y, bold, 12, slate);

  y -= 14;
  const detalles: string[] = [];
  if (input.cliente.numero_socio) detalles.push(`N° socio: ${input.cliente.numero_socio}`);
  if (input.cliente.documento) detalles.push(`CI: ${input.cliente.documento}`);
  if (input.cliente.telefono) detalles.push(`Tel: ${input.cliente.telefono}`);
  if (detalles.length > 0) {
    drawText(page, detalles.join("  ·  "), M, y, helv, 9, slateSoft);
  }

  y -= 18;
  page.drawLine({
    start: { x: M, y },
    end: { x: width - M, y },
    thickness: 0.5,
    color: rgb(0.92, 0.94, 0.97),
  });

  // ── Bloque concepto / fechas ───────────────────────────────────────────
  y -= 20;
  const concepto = input.factura.concepto?.trim() || `Cuota ${input.factura.numero_factura}`;
  drawText(page, "CONCEPTO", M, y, bold, 8, slateSoft);
  y -= 14;
  drawText(page, concepto, M, y, helv, 11, slate);

  y -= 20;
  const halfW = (width - M * 2) / 2;
  drawText(page, "EMISION",     M,            y, bold, 8, slateSoft);
  drawText(page, "VENCIMIENTO", M + halfW,    y, bold, 8, slateSoft);
  y -= 14;
  drawText(page, fmtDate(input.factura.fecha),             M,         y, helv, 10, slate);
  drawText(page, fmtDate(input.factura.fecha_vencimiento), M + halfW, y, helv, 10, slate);

  // ── Bloque monto (caja teal) ────────────────────────────────────────────
  y -= 30;
  const boxH = 62;
  page.drawRectangle({
    x: M,
    y: y - boxH,
    width: width - M * 2,
    height: boxH,
    color: rgb(0.94, 0.97, 0.97),
    borderColor: teal,
    borderWidth: 0.8,
  });
  drawText(page, "TOTAL A PAGAR", M + 14, y - 18, bold, 8, slateSoft);
  const totalStr = fmtMoney(input.factura.monto, input.factura.moneda);
  drawText(page, totalStr, M + 14, y - 40, bold, 22, teal);

  // Estado a la derecha del box
  const estado = input.factura.estado.toUpperCase();
  let estadoColor = slate;
  if (estado === "PAGADO") estadoColor = rgb(0.09, 0.6, 0.32);
  else if (estado === "VENCIDO") estadoColor = rgb(0.85, 0.22, 0.32);
  else if (estado === "ANULADO") estadoColor = rgb(0.55, 0.6, 0.68);
  const wEst = bold.widthOfTextAtSize(estado, 12);
  drawText(page, estado, width - M - 14 - wEst, y - 22, bold, 12, estadoColor);
  if (input.factura.saldo !== input.factura.monto) {
    const saldoStr = `Saldo: ${fmtMoney(input.factura.saldo, input.factura.moneda)}`;
    const wSal = helv.widthOfTextAtSize(saldoStr, 9);
    drawText(page, saldoStr, width - M - 14 - wSal, y - 40, helv, 9, slateSoft);
  }
  y -= boxH + 20;

  // ── Datos para pago ────────────────────────────────────────────────────
  if (input.emisor.banco || input.emisor.cuenta) {
    drawText(page, "COMO PAGAR", M, y, bold, 8, slateSoft);
    y -= 14;
    const lineas: string[] = [];
    if (input.emisor.banco) lineas.push(`Banco:   ${input.emisor.banco}`);
    if (input.emisor.cuenta) lineas.push(`Cuenta:  ${input.emisor.cuenta}`);
    if (input.emisor.titular_cuenta) lineas.push(`Titular: ${input.emisor.titular_cuenta}`);
    for (const l of lineas) {
      drawText(page, l, M, y, helv, 10, slate);
      y -= 13;
    }
    y -= 6;
    drawText(
      page,
      "Al transferir, guardar el comprobante y enviarlo a la tesoreria por WhatsApp.",
      M,
      y,
      helv,
      8,
      slateSoft
    );
    y -= 14;
  }

  // ── Pie ─────────────────────────────────────────────────────────────────
  const footer = ["Este recibo se genera automaticamente desde el sistema de la asociacion."];
  if (input.emisor.telefono) footer.push(`Tel: ${input.emisor.telefono}`);
  if (input.emisor.email) footer.push(input.emisor.email);
  const footerY = M + 8;
  page.drawLine({
    start: { x: M, y: footerY + 18 },
    end: { x: width - M, y: footerY + 18 },
    thickness: 0.5,
    color: rgb(0.92, 0.94, 0.97),
  });
  drawText(page, footer.join("  ·  "), M, footerY, helv, 7.5, slateSoft);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
