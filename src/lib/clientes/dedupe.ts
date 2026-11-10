import "server-only";
import { nombreClienteDisplay } from "@/lib/clientes/display-name";

/** Normaliza documento (RUC/cédula): solo alfanumérico, mayúsculas. */
export function normalizarDocumento(v: unknown): string {
  return String(v ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * La identidad detrás de un RUC o una cédula: en Paraguay el RUC de una
 * persona es su cédula más el dígito verificador (1234567-8). Sin esto, el
 * mismo cliente cargado una vez con la cédula (1234567) y otra con el RUC
 * (1234567-8) no se reconocía y quedaba duplicado.
 */
export function documentoBase(v: unknown): string {
  const t = String(v ?? "").trim().toUpperCase();
  const m = /^([0-9.\s]+)-\s*[0-9]$/.exec(t);
  return m ? m[1].replace(/\D/g, "") : normalizarDocumento(t);
}

/** Todas las identidades de un cliente (RUC, cédula y RUC de factura). */
export function documentosDe(c: Record<string, unknown>): Set<string> {
  const out = new Set<string>();
  for (const k of ["ruc", "documento", "ruc_factura"]) {
    const b = documentoBase(c[k]);
    if (b.length >= 3) out.add(b);
  }
  return out;
}

/** Normaliza nombre principal: sin acentos, espacios colapsados, mayúsculas, trim. */
export function normalizarNombre(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type DuplicadoMatch = {
  cliente_id: string;
  nombre: string;
  documento: string | null;
  estado: string;
  activo: boolean;
  tipo_servicio: string | null;
  match_type: "documento" | "nombre" | "ambos";
  display_url: string;
};

/**
 * Busca clientes existentes (no eliminados) que dupliquen por DOCUMENTO o por NOMBRE PRINCIPAL.
 * Nombre principal = empresa/razón social, o `nombre` (persona). NO usa contacto/teléfono/email.
 */
export async function buscarDuplicadosCliente(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  empresaId: string,
  input: { nombre?: string | null; documento?: string | null; excluirClienteId?: string | null }
): Promise<DuplicadoMatch[]> {
  const docN = documentoBase(input.documento);
  const nameN = normalizarNombre(input.nombre);
  if (!docN && !nameN) return [];

  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .eq("empresa_id", empresaId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);

  const out: DuplicadoMatch[] = [];
  for (const c of (data ?? []) as Record<string, unknown>[]) {
    const cid = String(c.id ?? "");
    if (!cid || (input.excluirClienteId && cid === input.excluirClienteId)) continue;
    const cdocs = documentosDe(c);
    const cname = normalizarNombre(nombreClienteDisplay(c, ""));
    const matchDoc = docN.length >= 3 && cdocs.has(docN);
    const matchName = !!nameN && cname === nameN;
    if (!matchDoc && !matchName) continue;
    const estado = String(c.estado ?? "activo");
    out.push({
      cliente_id: cid,
      nombre: nombreClienteDisplay(c, "").trim(),
      documento: ((c.ruc as string) || (c.documento as string) || null) as string | null,
      estado,
      activo: estado.trim().toLowerCase() === "activo",
      tipo_servicio: (c.tipo_servicio_cliente as string) ?? null,
      match_type: matchDoc && matchName ? "ambos" : matchDoc ? "documento" : "nombre",
      display_url: `/clientes/${cid}`,
    });
  }
  out.sort((a, b) => Number(b.activo) - Number(a.activo));
  return out;
}
