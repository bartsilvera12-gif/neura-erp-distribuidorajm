import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { CajaAbierta } from "./types";

/**
 * Caja abierta de la empresa, si hay alguna.
 *
 * `disponible: false` significa que el schema no tiene tabla `cajas`; distinto
 * de `caja: null`, que es "hay tabla pero ninguna caja abierta".
 */
export async function getCajaAbierta(): Promise<{ disponible: boolean; caja: CajaAbierta | null }> {
  try {
    const res = await fetchWithSupabaseSession("/api/cajas?estado=abierta", { cache: "no-store" });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { disponible?: boolean; caja?: CajaAbierta | null };
      error?: string;
    };
    if (!res.ok || !json.success || !json.data) {
      console.error("[cajas] getCajaAbierta:", json.error ?? res.statusText);
      return { disponible: false, caja: null };
    }
    return { disponible: json.data.disponible === true, caja: json.data.caja ?? null };
  } catch (e) {
    console.error("[cajas] getCajaAbierta:", e);
    return { disponible: false, caja: null };
  }
}

export type ResultadoCaja = { ok: true; cajaId: string } | { ok: false; error: string };

/** Abre la caja del día con el efectivo inicial del cajón. */
export async function abrirCaja(montoApertura: number): Promise<ResultadoCaja> {
  try {
    const res = await fetchWithSupabaseSession("/api/cajas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monto_apertura: montoApertura }),
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { caja_id?: string };
      error?: string;
    };
    if (!res.ok || !json.success || !json.data?.caja_id) {
      return { ok: false, error: json.error ?? "No se pudo abrir la caja." };
    }
    return { ok: true, cajaId: json.data.caja_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red." };
  }
}

/** Cierra la caja con el efectivo contado. Devuelve la diferencia contra lo esperado. */
export async function cerrarCaja(
  cajaId: string,
  montoContado: number
): Promise<
  { ok: true; contado: number; esperado: number; diferencia: number } | { ok: false; error: string }
> {
  try {
    const res = await fetchWithSupabaseSession(
      `/api/cajas/${encodeURIComponent(cajaId)}/cerrar`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monto_cierre_contado: montoContado }),
      }
    );
    const json = (await res.json()) as {
      success?: boolean;
      data?: { contado?: number; esperado?: number; diferencia?: number };
      error?: string;
    };
    if (!res.ok || !json.success || !json.data) {
      return { ok: false, error: json.error ?? "No se pudo cerrar la caja." };
    }
    return {
      ok: true,
      contado: json.data.contado ?? 0,
      esperado: json.data.esperado ?? 0,
      diferencia: json.data.diferencia ?? 0,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red." };
  }
}
