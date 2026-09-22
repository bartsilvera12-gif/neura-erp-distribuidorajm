/**
 * Storage del comprobante (foto/PDF) de una transferencia en conciliación.
 * Bucket privado `cobros-comprobantes`, path `{empresa_id}/{cobro_id}/comprobante.{ext}`.
 * Mismo patrón que compras/comprobante-storage.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export const COBROS_COMPROBANTES_BUCKET = "cobros-comprobantes";
export const ALLOWED_COMPROBANTE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
export const ALLOWED_COMPROBANTE_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
};
export const MAX_COMPROBANTE_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Revisa el comprobante antes de guardar nada y devuelve el problema en
 * castellano, o null si sirve.
 *
 * Es a propósito específico: "no se pudo procesar" no le dice a nadie qué
 * hacer. Acá el cobrador se entera de que mandó un archivo de 12 MB, o un
 * .heic del iPhone, o un archivo vacío, y puede arreglarlo solo.
 *
 * Lo que NO hace es adivinar si la foto es realmente un comprobante: eso lo
 * decide quien aprueba en Conciliación bancaria, que ve la imagen.
 */
export function revisarComprobante(file: { name?: string; type?: string; size?: number }): string | null {
  const nombre = String(file?.name ?? "archivo");
  const tipo = String(file?.type ?? "");
  const size = Number(file?.size ?? 0);

  if (size === 0) {
    return `«${nombre}» está vacío (0 bytes). Volvé a descargarlo o sacá la foto de nuevo.`;
  }
  if (!ALLOWED_COMPROBANTE_MIME.has(tipo)) {
    const ext = nombre.includes(".") ? nombre.split(".").pop()!.toUpperCase() : "";
    const que = ext ? `un archivo ${ext}` : "ese tipo de archivo";
    return `«${nombre}» es ${que} y no se puede adjuntar. Usá JPG, PNG, WebP o PDF — si es una foto del iPhone, compartila como JPG.`;
  }
  if (size > MAX_COMPROBANTE_BYTES) {
    const mb = (size / 1024 / 1024).toFixed(1);
    const max = (MAX_COMPROBANTE_BYTES / 1024 / 1024).toFixed(0);
    return `«${nombre}» pesa ${mb} MB y el máximo es ${max} MB. Mandá la imagen con menos calidad o sacá una captura de pantalla.`;
  }
  // Un JPG/PNG de menos de 1 KB no es una foto: es un archivo cortado.
  if (tipo !== "application/pdf" && size < 1024) {
    return `«${nombre}» pesa ${size} bytes: está incompleto y no se ve nada. Volvé a adjuntarlo.`;
  }
  return null;
}

let bucketEnsured = false;

export async function ensureCobrosComprobantesBucket(supabase: AppSupabaseClient): Promise<void> {
  if (bucketEnsured) return;
  try {
    const { data: existing } = await supabase.storage.getBucket(COBROS_COMPROBANTES_BUCKET);
    if (existing) { bucketEnsured = true; return; }
  } catch { /* intentar crear */ }
  const { error } = await supabase.storage.createBucket(COBROS_COMPROBANTES_BUCKET, {
    public: false, fileSizeLimit: MAX_COMPROBANTE_BYTES, allowedMimeTypes: [...ALLOWED_COMPROBANTE_MIME],
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`No se pudo crear el bucket: ${error.message}`);
  }
  bucketEnsured = true;
}

export function buildCobroComprobantePath(empresaId: string, cobroId: string, mime: string): string {
  const ext = ALLOWED_COMPROBANTE_EXT[mime] ?? "bin";
  return `${empresaId}/${cobroId}/comprobante.${ext}`;
}

export async function signCobroComprobante(supabase: AppSupabaseClient, path: string | null | undefined, ttl = 3600): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage.from(COBROS_COMPROBANTES_BUCKET).createSignedUrl(path, ttl);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch { return null; }
}

export function comprobantePathBelongsToEmpresa(path: string | null | undefined, empresaId: string): boolean {
  if (!path) return false;
  return path.split("/")[0] === empresaId;
}
