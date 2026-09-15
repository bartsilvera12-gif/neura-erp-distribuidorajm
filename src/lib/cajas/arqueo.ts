import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export interface IngresoPorMedio {
  medio: string;
  label: string;
  cantidad: number;
  total: number;
}

export interface ArqueoCaja {
  id: string;
  numero_caja: number;
  estado: "abierta" | "cerrada";
  fecha_apertura: string;
  fecha_cierre: string | null;
  monto_apertura: number;
  ingresos: { total: number; por_medio: IngresoPorMedio[] };
  salidas: { total: number; cantidad: number };
  ajustes: { total: number; cantidad: number };
  efectivo: {
    /** apertura + ingresos − salidas + ajustes, solo en efectivo. */
    esperado: number;
    /** Lo contado al cerrar. `null` mientras la caja está abierta. */
    contado: number | null;
    diferencia: number | null;
  };
}

export interface Arqueo {
  /** `false` si el schema no tiene `cajas` / `caja_movimientos`. */
  disponible: boolean;
  fecha?: string;
  cajas: ArqueoCaja[];
}

/** Arqueo de las cajas de un día. Sin `fecha`, hoy en hora de Asunción. */
export async function getArqueo(fecha?: string): Promise<Arqueo> {
  try {
    const qs = fecha ? `?fecha=${encodeURIComponent(fecha)}` : "";
    const res = await fetchWithSupabaseSession(`/api/cajas/arqueo${qs}`, { cache: "no-store" });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { arqueo?: Arqueo };
      error?: string;
    };
    if (!res.ok || !json.success || !json.data?.arqueo) {
      console.error("[cajas] getArqueo:", json.error ?? res.statusText);
      return { disponible: false, cajas: [] };
    }
    return json.data.arqueo;
  } catch (e) {
    console.error("[cajas] getArqueo:", e);
    return { disponible: false, cajas: [] };
  }
}
