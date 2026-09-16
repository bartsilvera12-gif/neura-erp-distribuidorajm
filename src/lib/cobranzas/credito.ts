import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export interface VentaCobranza {
  id: string;
  numero_control: string;
  fecha: string;
  vencimiento: string;
  total: number;
  cobrado: number;
  saldo: number;
  /** Días desde el vencimiento. Negativo = todavía no vence. */
  dias_vencida: number;
}

export interface ClienteCobranzaCredito {
  cliente_id: string | null;
  cliente: string;
  telefono: string | null;
  saldo: number;
  vencido: number;
  ventas: VentaCobranza[];
}

export interface CobranzaCredito {
  disponible: boolean;
  alcance?: "propias" | "todas";
  resumen: { total: number; vencido: number; clientes: number; ventas: number };
  clientes: ClienteCobranzaCredito[];
}

const VACIA: CobranzaCredito = {
  disponible: false,
  resumen: { total: 0, vencido: 0, clientes: 0, ventas: 0 },
  clientes: [],
};

/** Lo que falta cobrar de las ventas a crédito. */
export async function getCobranzaCredito(): Promise<CobranzaCredito> {
  try {
    const res = await fetchWithSupabaseSession("/api/cobranzas/credito", { cache: "no-store" });
    const json = (await res.json()) as {
      success?: boolean;
      data?: Partial<CobranzaCredito>;
      error?: string;
    };
    if (!res.ok || !json.success || !json.data) {
      console.error("[cobranzas] getCobranzaCredito:", json.error ?? res.statusText);
      return VACIA;
    }
    return {
      disponible: json.data.disponible === true,
      alcance: json.data.alcance,
      resumen: json.data.resumen ?? VACIA.resumen,
      clientes: json.data.clientes ?? [],
    };
  } catch (e) {
    console.error("[cobranzas] getCobranzaCredito:", e);
    return VACIA;
  }
}

/** Registra un cobro. Devuelve el saldo que queda, o el motivo del rechazo. */
export async function cobrarVenta(
  ventaId: string,
  monto: number,
  medioPago: string
): Promise<{ ok: true; saldo: number } | { ok: false; error: string }> {
  try {
    const res = await fetchWithSupabaseSession("/api/cobranzas/credito/cobrar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venta_id: ventaId, monto, medio_pago: medioPago }),
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { saldo?: number };
      error?: string;
    };
    if (!res.ok || !json.success) {
      return { ok: false, error: json.error ?? "No se pudo registrar el cobro." };
    }
    return { ok: true, saldo: json.data?.saldo ?? 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red." };
  }
}
