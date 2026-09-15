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
