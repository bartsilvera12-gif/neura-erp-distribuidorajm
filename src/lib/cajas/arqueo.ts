import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export interface IngresoPorMedio {
  medio: string;
  label: string;
  cantidad: number;
  total: number;
}

/** Un movimiento cargado a mano: retiro, egreso o ajuste, con su concepto. */
export interface MovimientoManualCaja {
  tipo: string;
  concepto: string;
  medio: string;
  label: string;
  monto: number;
  fecha: string | null;
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
  /** Lo que se cargó a mano (no vino de una venta). */
  movimientos_manuales?: MovimientoManualCaja[];
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
  /** `mia` = solo la caja propia (lo normal). `todas` = las del día. */
  alcance?: "mia" | "todas";
  /** Ventas a crédito del día: vendidas pero no cobradas, fuera del cajón. */
  credito?: { cantidad: number; total: number };
  cajas: ArqueoCaja[];
  /**
   * Cajas del día que NO son tuyas, cuando el arqueo propio quedó vacío. Un
   * cero sin esto se lee como "no se cobró nada", y puede ser que la plata esté
   * en la caja de otra persona.
   */
  otras_cajas?: number;
}

/** Arqueo de las cajas de un día. Sin `fecha`, hoy en hora de Asunción. */
export async function getArqueo(fecha?: string, todas = false): Promise<Arqueo> {
  try {
    const params = new URLSearchParams();
    if (fecha) params.set("fecha", fecha);
    if (todas) params.set("alcance", "todas");
    const qs = params.size > 0 ? `?${params.toString()}` : "";
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
