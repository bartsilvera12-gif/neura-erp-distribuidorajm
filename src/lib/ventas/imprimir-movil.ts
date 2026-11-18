import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/** true en celulares/tablets, donde window.print() solo ofrece guardar o compartir. */
export function esDispositivoMovil(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * Abre el PDF de la factura para que el celular ofrezca "Abrir con" (por
 * ejemplo la app de la impresora térmica ESC/POS), en lugar del diálogo de
 * impresión del navegador.
 */
export function abrirPdfParaImprimir(url: string, nombre: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noreferrer";
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function aDataUrl(src: string): Promise<string> {
  if (src.startsWith("data:")) return src;
  const res = await fetch(src);
  const blob = await res.blob();
  return await new Promise<string>((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => mal(r.error);
    r.readAsDataURL(blob);
  });
}

/** Copia el estilo calculado de cada nodo al clon, para que se dibuje igual fuera de la página. */
function copiarEstilos(origen: Element, clon: Element): void {
  const cs = getComputedStyle(origen);
  let css = "";
  for (let i = 0; i < cs.length; i++) {
    const k = cs.item(i);
    css += `${k}:${cs.getPropertyValue(k)};`;
  }
  (clon as HTMLElement).setAttribute("style", css);
  for (let i = 0; i < origen.children.length; i++) {
    copiarEstilos(origen.children[i], clon.children[i]);
  }
}

/** Dibuja el ticket (nodo del DOM) en un PNG con el ancho y alto que tiene en pantalla. */
async function ticketAPng(el: HTMLElement, escala: number): Promise<{ png: Uint8Array; w: number; h: number }> {
  const w = Math.ceil(el.offsetWidth);
  const h = Math.ceil(el.offsetHeight);
  const clon = el.cloneNode(true) as HTMLElement;
  copiarEstilos(el, clon);
  clon.style.margin = "0";
  clon.style.boxShadow = "none";
  const imgs = Array.from(clon.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      img.setAttribute("src", await aDataUrl(img.getAttribute("src") ?? ""));
    }),
  );
  clon.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  const xml = new XMLSerializer().serializeToString(clon);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;
  const img = new Image();
  await new Promise<void>((ok, mal) => {
    img.onload = () => ok();
    img.onerror = () => mal(new Error("No se pudo dibujar el ticket."));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * escala);
  canvas.height = Math.round(h * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar el ticket.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/png");
  const bin = atob(dataUrl.split(",")[1]);
  const png = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) png[i] = bin.charCodeAt(i);
  return { png, w, h };
}

/**
 * Arma un PDF del ticket con el ancho elegido (80 o 58 mm) y el alto del
 * contenido, tal como se ve en pantalla.
 */
export async function ticketAPdf(el: HTMLElement, anchoMm: number): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const { png, w, h } = await ticketAPng(el, 3);
  const doc = await PDFDocument.create();
  const anchoPt = (anchoMm / 25.4) * 72;
  const altoPt = anchoPt * (h / w);
  const page = doc.addPage([anchoPt, altoPt]);
  const imagen = await doc.embedPng(png);
  page.drawImage(imagen, { x: 0, y: 0, width: anchoPt, height: altoPt });
  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

/**
 * En el celular: PDF del ticket (ancho 80/58 mm) y se comparte con la hoja de
 * compartir del sistema para elegir la app de impresión térmica (RawBT, etc.).
 * Si no se pueden compartir archivos, se abre/descarga.
 */
export async function compartirTicketEnMovil(el: HTMLElement, anchoMm: number, nombre: string): Promise<void> {
  const blob = await ticketAPdf(el, anchoMm);
  const file = new File([blob], nombre, { type: "application/pdf" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: nombre });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  abrirPdfParaImprimir(url, nombre);
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

/** Baja el KuDE en PDF de la factura y lo abre para elegir la app de impresión. */
export async function imprimirKudeEnMovil(facturaId: string): Promise<void> {
  const res = await fetchWithSupabaseSession(`/api/facturas/${facturaId}/sifen/kude`);
  if (!res.ok) throw new Error(`No se pudo obtener el PDF de la factura (${res.status}).`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  abrirPdfParaImprimir(url, `factura-${facturaId.slice(0, 8)}.pdf`);
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
