import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { Camion, Reparto } from "./types";

export type ResultadoReparto = { ok: true; repartoId: string } | { ok: false; error: string };

/**
 * Repartos de un día, o solo los abiertos. `disponible` es false si el schema
 * no tiene el dominio de repartos.
 */
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

/** Camiones de la empresa. `todos` incluye los dados de baja. */
export async function getCamiones(todos = false): Promise<Camion[]> {
  try {
    const res = await fetchWithSupabaseSession(`/api/camiones${todos ? "?todos=1" : ""}`, {
      cache: "no-store",
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { camiones?: Camion[] };
      error?: string;
    };
    if (!res.ok || !json.success) {
      console.error("[repartos] getCamiones:", json.error ?? res.statusText);
      return [];
    }
    return json.data?.camiones ?? [];
  } catch (e) {
    console.error("[repartos] getCamiones:", e);
    return [];
  }
}

/** Abre un reparto con la carga del camión. */
export async function abrirReparto(datos: {
  camion_id: string;
  repartidor_id: string;
  fecha?: string;
  items: { producto_id: string; cantidad_inicial: number }[];
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

/** Cierra el reparto con la merma total declarada. */
export async function cerrarReparto(
  repartoId: string,
  datos: { merma_kg: number; notas_cierre?: string }
): Promise<ResultadoReparto> {
  try {
    const res = await fetchWithSupabaseSession(
      `/api/repartos/${encodeURIComponent(repartoId)}/cerrar`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
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

/** Da de alta un camión. */
export async function crearCamion(datos: {
  alias: string;
  patente?: string;
}): Promise<{ ok: true; camionId: string } | { ok: false; error: string }> {
  try {
    const res = await fetchWithSupabaseSession("/api/camiones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { camion_id?: string };
      error?: string;
    };
    if (!res.ok || !json.success || !json.data?.camion_id) {
      return { ok: false, error: json.error ?? "No se pudo dar de alta el camión." };
    }
    return { ok: true, camionId: json.data.camion_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red." };
  }
}

/** Da de baja (o reactiva) un camión. */
export async function setCamionActivo(
  camionId: string,
  activo: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetchWithSupabaseSession(`/api/camiones/${encodeURIComponent(camionId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo }),
    });
    const json = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !json.success) {
      return { ok: false, error: json.error ?? "No se pudo actualizar el camión." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red." };
  }
}
