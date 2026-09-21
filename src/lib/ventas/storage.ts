import type { Venta } from "./types";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export type ResultadoGuardarVenta =
  | { success: true; venta: Venta }
  | { success: false; error: string };

/**
 * Lista ventas del tenant (misma fuente que el dashboard: tablas `ventas` / `ventas_items`).
 */
export async function getVentas(): Promise<Venta[]> {
  try {
    const res = await fetchWithSupabaseSession("/api/ventas", { cache: "no-store" });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { ventas?: Venta[] };
      error?: string;
    };
    if (!res.ok || !json.success || !json.data?.ventas) {
      console.error("[ventas] getVentas:", json.error ?? res.statusText);
      return [];
    }
    return json.data.ventas;
  } catch (e) {
    console.error("[ventas] getVentas:", e);
    return [];
  }
}

/**
 * Crea una venta en base de datos (transacción servidor: ítems, stock, movimientos).
 */
export async function saveVenta(
  datos: Omit<Venta, "id" | "numero_control" | "fecha">
): Promise<ResultadoGuardarVenta> {
  if (!datos.items || datos.items.length === 0) {
    return { success: false, error: "La venta debe tener al menos un producto." };
  }

  try {
    const res = await fetchWithSupabaseSession("/api/ventas/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: datos.items,
        moneda: datos.moneda,
        tipo_cambio: datos.tipo_cambio,
        subtotal: datos.subtotal,
        monto_iva: datos.monto_iva,
        total: datos.total,
        tipo_venta: datos.tipo_venta,
        plazo_dias: datos.plazo_dias,
        metodo_pago: datos.metodo_pago ?? null,
        caja_id: datos.caja_id ?? null,
        reparto_id: datos.reparto_id ?? null,
        cliente_id: datos.cliente_id ?? null,
        observaciones: null,
      }),
    });

    const json = (await res.json()) as {
      success?: boolean;
      data?: { venta?: Venta };
      error?: string;
    };

    if (!res.ok || !json.success || !json.data?.venta) {
      return {
        success: false,
        error: json.error ?? `No se pudo registrar la venta (${res.status}).`,
      };
    }

    return { success: true, venta: json.data.venta };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de red.";
    return { success: false, error: msg };
  }
}

/**
 * Anula una venta: deja sin efecto el cobro y devuelve la mercadería al camión.
 *
 * El número de la venta no se reutiliza. Anular no borra: la venta queda a la
 * vista, marcada, porque un comprobante que desaparece es un comprobante que
 * nadie puede explicar después.
 */
export async function anularVenta(
  ventaId: string,
  motivo?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetchWithSupabaseSession(
      `/api/ventas/${encodeURIComponent(ventaId)}/anular`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo ?? "" }),
      }
    );
    const json = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !json.success) {
      return { ok: false, error: json.error ?? "No se pudo anular la venta." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red." };
  }
}
