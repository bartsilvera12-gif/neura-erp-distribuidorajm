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

/** Baja el KuDE en PDF de la factura y lo abre para elegir la app de impresión. */
export async function imprimirKudeEnMovil(facturaId: string): Promise<void> {
  const res = await fetchWithSupabaseSession(`/api/facturas/${facturaId}/sifen/kude`);
  if (!res.ok) throw new Error(`No se pudo obtener el PDF de la factura (${res.status}).`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  abrirPdfParaImprimir(url, `factura-${facturaId.slice(0, 8)}.pdf`);
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
