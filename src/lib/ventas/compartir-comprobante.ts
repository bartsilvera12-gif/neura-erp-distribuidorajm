import { comprobanteEnTexto, type DatosComprobante } from "@/lib/ventas/comprobante";

/**
 * Compartir el comprobante desde el celular.
 *
 * Vive acá y no dentro de la factura porque la pantalla de "venta realizada"
 * ofrece Compartir antes de abrir el comprobante: el vendedor le manda la
 * factura al cliente sin tener que mirarla primero. Un solo camino para las dos
 * pantallas evita que una mande un texto distinto de la otra.
 *
 * Devuelve el aviso que hay que mostrar, o `null` cuando el menú nativo se
 * encargó (o el usuario lo canceló, que no es un error que valga un cartel).
 */
export async function compartirComprobante(datos: DatosComprobante): Promise<string | null> {
  const texto = comprobanteEnTexto(datos);
  const nav = navigator as Navigator & {
    share?: (d: { text: string; title: string }) => Promise<void>;
  };
  if (nav.share) {
    try {
      await nav.share({ title: `Venta ${datos.venta.numero_control}`, text: texto });
      return null;
    } catch {
      // El navegador lo rechazó o el usuario canceló: queda el portapapeles.
    }
  }
  try {
    await navigator.clipboard.writeText(texto);
    return "Comprobante copiado: pegalo donde lo necesites.";
  } catch {
    return "Este navegador no deja compartir ni copiar automáticamente.";
  }
}

/** Abre WhatsApp con el comprobante. Con teléfono va al chat del cliente. */
export function whatsappComprobante(datos: DatosComprobante, telefonoCliente?: string | null): void {
  const limpio = (telefonoCliente ?? "").replace(/\D/g, "");
  const base = limpio ? `https://wa.me/${limpio}` : "https://wa.me/";
  window.open(`${base}?text=${encodeURIComponent(comprobanteEnTexto(datos))}`, "_blank", "noopener");
}
