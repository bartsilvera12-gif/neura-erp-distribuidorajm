"use client";

/**
 * Deja un comprobante listo para subir.
 *
 * Dos problemas del mundo real, del mismo lado:
 *
 *  1. El iPhone saca fotos en HEIC. Si el `accept` del input solo admite
 *     JPG/PNG/WebP, Safari descarta la foto recién tomada y el usuario ve que
 *     "no pasa nada". Por eso el input acepta `image/*` y la normalización se
 *     hace acá: cualquier imagen se re-dibuja y sale como JPEG.
 *  2. Una foto de celular pesa fácil 6–12 MB y el límite del servidor es 8 MB.
 *     Bajarla a 2000 px de lado mayor la deja en unos cientos de KB sin que se
 *     deje de leer el comprobante.
 *
 * Los PDF no se tocan. Si algo falla, se devuelve el archivo original: es
 * preferible que el servidor lo rechace con un motivo claro a perder el
 * comprobante por una conversión.
 */

const YA_SIRVEN = new Set(["image/jpeg", "image/png", "image/webp"]);
const LADO_MAXIMO = 2000;
const CALIDAD = 0.85;
/** Arriba de esto conviene recomprimir aunque el formato ya sirva. */
const PESO_COMODO = 2 * 1024 * 1024;

export async function prepararComprobante(file: File): Promise<File> {
  if (file.type === "application/pdf") return file;
  if (!file.type.startsWith("image/")) return file;
  if (YA_SIRVEN.has(file.type) && file.size <= PESO_COMODO) return file;

  try {
    const bitmap = await cargarImagen(file);
    const anchoOriginal = "width" in bitmap ? bitmap.width : 0;
    const altoOriginal = "height" in bitmap ? bitmap.height : 0;
    if (!anchoOriginal || !altoOriginal) return file;

    const escala = Math.min(1, LADO_MAXIMO / Math.max(anchoOriginal, altoOriginal));
    const ancho = Math.max(1, Math.round(anchoOriginal * escala));
    const alto = Math.max(1, Math.round(altoOriginal * escala));

    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, ancho, alto);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", CALIDAD)
    );
    if (!blob || blob.size === 0) return file;

    const nombre = file.name.replace(/\.[^.]+$/, "") || "comprobante";
    return new File([blob], `${nombre}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** Decodifica la imagen, con `createImageBitmap` si está y si no con un <img>. */
async function cargarImagen(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* algunos formatos no los toma: se sigue con <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("no se pudo leer la imagen"));
      img.src = url;
    });
  } finally {
    // Se libera después del draw: el navegador ya tiene los píxeles decodificados.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/** Lo que el input debe aceptar para que el iPhone ofrezca la cámara. */
export const ACCEPT_COMPROBANTE = "image/*,application/pdf";
