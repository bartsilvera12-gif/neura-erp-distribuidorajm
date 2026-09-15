import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { FormaPagoVenta } from "./types";

/** Una fila del desglose: un medio de cobro con su cantidad y su importe. */
export interface LineaArqueo {
  forma_pago: FormaPagoVenta;
  label: string;
  cantidad: number;
  total: number;
}

export interface Arqueo {
  /** Día del arqueo en hora de Asunción, YYYY-MM-DD. */
  fecha: string;
  /**
   * `false` si el schema todavía no tiene la columna `forma_pago`
   * (ver supabase/distribuidorajm/05_forma_pago.sql). El total del día sigue
   * siendo correcto; lo que falta es el desglose.
   */
  tiene_forma_pago: boolean;
  lineas: LineaArqueo[];
  /** Ventas sin medio de cobro registrado. Se muestran para que el desglose cierre. */
  sin_clasificar: { cantidad: number; total: number };
  totales: { cantidad: number; total: number; contado: number; credito: number };
}

/** Arqueo de un día. Sin `fecha`, el servidor usa hoy en hora de Asunción. */
export async function getArqueo(fecha?: string): Promise<Arqueo | null> {
  try {
    const qs = fecha ? `?fecha=${encodeURIComponent(fecha)}` : "";
    const res = await fetchWithSupabaseSession(`/api/ventas/arqueo${qs}`, { cache: "no-store" });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { arqueo?: Arqueo };
      error?: string;
    };
    if (!res.ok || !json.success || !json.data?.arqueo) {
      console.error("[ventas] getArqueo:", json.error ?? res.statusText);
      return null;
    }
    return json.data.arqueo;
  } catch (e) {
    console.error("[ventas] getArqueo:", e);
    return null;
  }
}
