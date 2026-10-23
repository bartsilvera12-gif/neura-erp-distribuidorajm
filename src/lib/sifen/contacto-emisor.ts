import "server-only";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getAutoimpresor } from "@/lib/facturacion/server/facturacion-modo-pg";
import { EMAIL_RELLENO, TELEFONO_RELLENO } from "./contacto-relleno";

/**
 * Teléfono y correo del emisor para el XML de la factura electrónica, tomados
 * de Configuración → Facturación (los mismos que salen en el ticket).
 */
export async function contactoEmisorSifen(empresaId: string): Promise<{ telefono: string; email: string }> {
  try {
    const schema = await fetchDataSchemaForEmpresaId(empresaId);
    const ai = await getAutoimpresor(schema, empresaId);
    const tel = (ai.telefono ?? "").replace(/\D/g, "");
    const email = (ai.email ?? "").trim().toLowerCase();
    return {
      telefono: tel.length >= 8 && tel.length <= 15 ? tel : TELEFONO_RELLENO,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 80 ? email : EMAIL_RELLENO,
    };
  } catch {
    return { telefono: TELEFONO_RELLENO, email: EMAIL_RELLENO };
  }
}
