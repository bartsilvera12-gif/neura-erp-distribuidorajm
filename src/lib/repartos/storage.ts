import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { Reparto } from "./types";

export type ResultadoReparto = { ok: true; repartoId: string } | { ok: false; error: string };

/** Repartos de un día, o solo los abiertos. `disponible` es false sin la migración 06. */
export async function getRepartos(opts?: {
  fecha?: string;
  abiertos?: boolean;
}): Promise<{ disponible: boolean; repartos: Reparto[] }> {
  try {
    const params = new URLSearchParams();
    if (opts?.abiertos) params.set("abiertos", "1");
    else if (opts?.fecha) params.set("fecha", opts.fecha);
    const qs = params.toString();

    const res = await fetchWithSupabaseSession(`/api/repartos${qs ? `?${qs}` : ""}`, {
      cache: "no-store",
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { disponible?: boolean; repartos?: Reparto[] };
      error?: string;
    };
    if (!res.ok || !json.success || !json.data) {
      console.error("[repartos] getRepartos:", json.error ?? res.statusText);
      return { disponible: false, repartos: [] };
    }
    return {
      disponible: json.data.disponible === true,
      repartos: json.data.repartos ?? [],
    };
  } catch (e) {
    console.error("[repartos] getRepartos:", e);
    return { disponible: false, repartos: [] };
  }
}

/** Abre un reparto con su carga inicial. */
export async function abrirReparto(datos: {
  camion: string;
  responsable?: string;
  observaciones?: string;
  items: { producto_id: string; cargado: number }[];
}): Promise<ResultadoReparto> {
  try {
    const res = await fetchWithSupabaseSession("/api/repartos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { reparto_id?: string };
      error?: string;
    };
    if (!res.ok || !json.success || !json.data?.reparto_id) {
      return { ok: false, error: json.error ?? "No se pudo abrir el reparto." };
    }
    return { ok: true, repartoId: json.data.reparto_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red." };
  }
}

/** Guarda el conteo de retorno y cierra el reparto. */
export async function cerrarReparto(
  repartoId: string,
  items: { producto_id: string; retornado: number; devuelto: number }[]
): Promise<ResultadoReparto> {
  try {
    const res = await fetchWithSupabaseSession(
      `/api/repartos/${encodeURIComponent(repartoId)}/cerrar`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      }
    );
    const json = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !json.success) {
      return { ok: false, error: json.error ?? "No se pudo cerrar el reparto." };
    }
    return { ok: true, repartoId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red." };
  }
}
