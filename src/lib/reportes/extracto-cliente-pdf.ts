import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface ExtractoFila {
  numero: string;
  fecha: string;
  vendedor: string;
  camion: string;
  condicion: string;
  monto: number;
}

export interface ExtractoPdfInput {
  cliente: { nombre: string; ruc: string | null };
  desde: string;
  hasta: string;
  vendedor: string;
  filas: ExtractoFila[];
  total: number;
}

const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString("es-PY")}`;
const fechaDMY = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s);
// Helvetica estándar solo admite WinAnsi: se limpian caracteres raros.
const limpio = (s: string) => s.replace(/[^\x20-\x7EÁÉÍÓÚÑáéíóúñüÜ°]/g, "?");

/** Extracto de ventas de un cliente en PDF A4 (con paginado y total general). */
export async function extractoClientePdf(d: ExtractoPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 36;
  const teal = rgb(0.31, 0.68, 0.7);
  const gris = rgb(0.4, 0.4, 0.4);
  const X = { num: M, fecha: M + 130, vend: M + 195, cam: M + 330, cond: M + 410, monto: W - M };

  const cortar = (t: string, max: number, f = normal, size = 8.5) => {
    let s = limpio(t);
    while (s.length > 1 && f.widthOfTextAtSize(s, size) > max) s = s.slice(0, -1);
    return s;
  };

  let page = doc.addPage([W, H]);
  let y = H - M;

  const encabezadoTabla = () => {
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 18, color: teal });
    const c = rgb(1, 1, 1);
    page.drawText("Factura", { x: X.num + 4, y, size: 9, font: bold, color: c });
    page.drawText("Fecha", { x: X.fecha, y, size: 9, font: bold, color: c });
    page.drawText("Vendedor", { x: X.vend, y, size: 9, font: bold, color: c });
    page.drawText("Camion", { x: X.cam, y, size: 9, font: bold, color: c });
    page.drawText("Condicion", { x: X.cond, y, size: 9, font: bold, color: c });
    const t = "Monto";
    page.drawText(t, { x: X.monto - 4 - bold.widthOfTextAtSize(t, 9), y, size: 9, font: bold, color: c });
    y -= 20;
  };

  page.drawText("EXTRACTO DE VENTAS POR CLIENTE", { x: M, y, size: 16, font: bold, color: teal });
  y -= 24;
  page.drawText(cortar(d.cliente.nombre, W - 2 * M, bold, 12), { x: M, y, size: 12, font: bold });
  y -= 16;
  page.drawText(`RUC / Doc.: ${limpio(d.cliente.ruc ?? "-")}`, { x: M, y, size: 10, font: normal, color: gris });
  y -= 14;
  const periodo = `Periodo: ${d.desde ? fechaDMY(d.desde) : "inicio"} al ${d.hasta ? fechaDMY(d.hasta) : "hoy"}`;
  page.drawText(periodo + (d.vendedor ? `   |   Vendedor: ${limpio(d.vendedor)}` : ""), { x: M, y, size: 10, font: normal, color: gris });
  y -= 12;
  page.drawText("Facturas anuladas excluidas.", { x: M, y, size: 8, font: normal, color: gris });
  y -= 22;
  encabezadoTabla();

  d.filas.forEach((f, i) => {
    if (y < M + 50) {
      page = doc.addPage([W, H]);
      y = H - M;
      encabezadoTabla();
    }
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 15, color: rgb(0.96, 0.97, 0.97) });
    page.drawText(cortar(f.numero, 120), { x: X.num + 4, y, size: 8.5, font: normal });
    page.drawText(fechaDMY(f.fecha), { x: X.fecha, y, size: 8.5, font: normal });
    page.drawText(cortar(f.vendedor || "-", 125), { x: X.vend, y, size: 8.5, font: normal });
    page.drawText(cortar(f.camion || "-", 75), { x: X.cam, y, size: 8.5, font: normal });
    page.drawText(limpio(f.condicion).replace("é", "e"), { x: X.cond, y, size: 8.5, font: normal });
    const m = gs(f.monto);
    page.drawText(m, { x: X.monto - 4 - normal.widthOfTextAtSize(m, 8.5), y, size: 8.5, font: normal });
    y -= 15;
  });

  if (d.filas.length === 0) {
    page.drawText("Sin facturas en el periodo seleccionado.", { x: M, y, size: 10, font: normal, color: gris });
    y -= 20;
  }

  if (y < M + 40) { page = doc.addPage([W, H]); y = H - M; }
  y -= 6;
  page.drawLine({ start: { x: M, y: y + 12 }, end: { x: W - M, y: y + 12 }, thickness: 1, color: teal });
  page.drawText(`${d.filas.length} factura${d.filas.length === 1 ? "" : "s"}`, { x: M, y, size: 10, font: normal, color: gris });
  const tt = `TOTAL GENERAL: ${gs(d.total)}`;
  page.drawText(tt, { x: X.monto - bold.widthOfTextAtSize(tt, 12), y, size: 12, font: bold });

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const t = `Pagina ${i + 1} de ${pages.length}`;
    p.drawText(t, { x: W - M - normal.widthOfTextAtSize(t, 8), y: 20, size: 8, font: normal, color: gris });
  });
  return doc.save();
}
