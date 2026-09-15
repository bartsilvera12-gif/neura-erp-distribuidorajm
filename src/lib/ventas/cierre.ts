import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export interface LineaCobranza {
  metodo: string;
  label: string;
  cantidad: number;
  total: number;
}

export interface CierreReparto {
  /** Día del cierre en hora de Asunción, YYYY-MM-DD. */
  fecha: string;
  ventas: {
    /** Vendido del día sin contar las anuladas. */
    facturado: number;
    contado: number;
    credito: number;
    cantidad: number;
    anuladas: { cantidad: number; total: number };
  };
  cobranzas: {
    /** `false` si el schema no tiene tabla `pagos`. */
    disponible: boolean;
    lineas: LineaCobranza[];
    total: number;
    cantidad: number;
  };
}

/** Cierre de un día. Sin `fecha`, el servidor usa hoy en hora de Asunción. */
export async function getCierreReparto(fecha?: string): Promise<CierreReparto | null> {
  try {
    const qs = fecha ? `?fecha=${encodeURIComponent(fecha)}` : "";
    const res = await fetchWithSupabaseSession(`/api/ventas/cierre${qs}`, { cache: "no-store" });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { cierre?: CierreReparto };
      error?: string;
    };
    if (!res.ok || !json.success || !json.data?.cierre) {
      console.error("[ventas] getCierreReparto:", json.error ?? res.statusText);
      return null;
    }
    return json.data.cierre;
  } catch (e) {
    console.error("[ventas] getCierreReparto:", e);
    return null;
  }
}
