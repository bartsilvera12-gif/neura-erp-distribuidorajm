import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export interface LineaCobranza {
  metodo: string;
  label: string;
  cantidad: number;
  total: number;
}

/** Totales de mercadería agrupados por unidad: kilos y unidades no se suman. */
export interface LineaMercaderia {
  unidad: string;
  inicial: number;
  vendido: number;
  devuelto: number;
  /** Lo contado si el reparto ya se cerró; si no, lo que debería volver. */
  regresa: number;
  /** contado − teórico. 0 mientras no se contó. */
  diferencia: number;
}

export interface CierreReparto {
  /** Día del cierre en hora de Asunción, YYYY-MM-DD. */
  fecha: string;
  /** `null` cuando el cierre es del día y no de un reparto puntual. */
  reparto: {
    id: string;
    camion: string;
    repartidor: string | null;
    estado: "abierto" | "cerrado";
  } | null;
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
  mercaderia: {
    disponible: boolean;
    /** `true` si ya se hizo el conteo físico. */
    contado: boolean;
    lineas: LineaMercaderia[];
  };
}

/**
 * Rellena los bloques que la respuesta no traiga.
 *
 * El cliente no controla la forma de lo que llega: durante un despliegue el
 * front nuevo puede hablar un rato con el backend viejo, y bastaba que faltara
 * un bloque para que la pantalla entera se cayera con "Application error".
 * Un cierre incompleto se muestra en cero; una pantalla en blanco no se muestra.
 */
function normalizar(c: Partial<CierreReparto> | null | undefined): CierreReparto | null {
  if (!c || typeof c !== "object") return null;
  return {
    fecha: c.fecha ?? "",
    reparto: c.reparto ?? null,
    ventas: {
      facturado: c.ventas?.facturado ?? 0,
      contado: c.ventas?.contado ?? 0,
      credito: c.ventas?.credito ?? 0,
      cantidad: c.ventas?.cantidad ?? 0,
      anuladas: {
        cantidad: c.ventas?.anuladas?.cantidad ?? 0,
        total: c.ventas?.anuladas?.total ?? 0,
      },
    },
    cobranzas: {
      disponible: c.cobranzas?.disponible ?? false,
      lineas: c.cobranzas?.lineas ?? [],
      total: c.cobranzas?.total ?? 0,
      cantidad: c.cobranzas?.cantidad ?? 0,
    },
    mercaderia: {
      disponible: c.mercaderia?.disponible ?? false,
      contado: c.mercaderia?.contado ?? false,
      lineas: c.mercaderia?.lineas ?? [],
    },
  };
}

/**
 * Cierre de un día, o de un reparto puntual si se pasa `repartoId`.
 * Sin ninguno de los dos, el servidor usa hoy en hora de Asunción.
 */
export async function getCierreReparto(
  fecha?: string,
  repartoId?: string
): Promise<CierreReparto | null> {
  try {
    const qs = repartoId
      ? `?reparto=${encodeURIComponent(repartoId)}`
      : fecha
        ? `?fecha=${encodeURIComponent(fecha)}`
        : "";
    const res = await fetchWithSupabaseSession(`/api/ventas/cierre${qs}`, { cache: "no-store" });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { cierre?: Partial<CierreReparto> };
      error?: string;
    };
    if (!res.ok || !json.success || !json.data?.cierre) {
      console.error("[ventas] getCierreReparto:", json.error ?? res.statusText);
      return null;
    }
    return normalizar(json.data.cierre);
  } catch (e) {
    console.error("[ventas] getCierreReparto:", e);
    return null;
  }
}
