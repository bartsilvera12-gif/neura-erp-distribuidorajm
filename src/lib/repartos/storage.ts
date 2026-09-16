import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { Camion, ObjetivoCamion, RepartidorReparto, Reparto, Ubicacion } from "./types";

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
    // Cada reparto sale de acá con `items` sí o sí: una pantalla que recorre la
    // lista no tiene por qué defenderse de una respuesta incompleta.
    return {
      disponible: json.data.disponible === true,
      repartos: (json.data.repartos ?? []).map((r) => ({ ...r, items: r.items ?? [] })),
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

/**
 * Abre la jornada del camión. No lleva mercadería: el camión ya tiene su stock
 * y la apertura solo saca la foto de ese saldo.
 */
export async function abrirReparto(datos: {
  camion_id: string;
  repartidor_id: string;
  fecha?: string;
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

/** Rendición de ruta: conteo físico por producto, merma y notas. */
export async function cerrarReparto(
  repartoId: string,
  datos: {
    items: { producto_id: string; contado: number; motivo?: string }[];
    merma_kg: number;
    notas_cierre?: string;
    /** Efectivo contado en el cajón. Sin esto se cierra con lo esperado. */
    efectivo_contado?: number;
  }
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

/** Da de alta un camión. Su ubicación de inventario la crea el servidor. */
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

/**
 * Asigna (o desasigna, con `null`) el vendedor que sale con este camión.
 *
 * Es lo que después permite que su reparto se abra solo al primer cobro.
 */
export async function setRepartidorCamion(
  camionId: string,
  repartidorId: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetchWithSupabaseSession(`/api/camiones/${encodeURIComponent(camionId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repartidor_id: repartidorId }),
    });
    const json = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !json.success) {
      return { ok: false, error: json.error ?? "No se pudo asignar el camión." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red." };
  }
}

/** Ubicaciones fijas (salón, depósitos) para elegir destino de transferencia. */
export async function getUbicaciones(): Promise<Ubicacion[]> {
  try {
    const res = await fetchWithSupabaseSession("/api/ubicaciones", { cache: "no-store" });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { ubicaciones?: Ubicacion[] };
      error?: string;
    };
    if (!res.ok || !json.success) {
      console.error("[repartos] getUbicaciones:", json.error ?? res.statusText);
      return [];
    }
    return json.data?.ubicaciones ?? [];
  } catch (e) {
    console.error("[repartos] getUbicaciones:", e);
    return [];
  }
}

/**
 * Carga de proveedor o transferencia a un punto fijo, sobre el reparto abierto.
 */
export async function registrarMovimiento(
  repartoId: string,
  datos: {
    tipo: "carga" | "transferencia";
    items: { producto_id: string; cantidad: number }[];
    destino_id?: string;
    referencia?: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetchWithSupabaseSession(
      `/api/repartos/${encodeURIComponent(repartoId)}/movimientos`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
      }
    );
    const json = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !json.success) {
      return { ok: false, error: json.error ?? "No se pudo registrar el movimiento." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red." };
  }
}

/** Objetivo, remanente y sugerido de cada producto para un camión. */
export async function getObjetivos(camionId: string): Promise<ObjetivoCamion[]> {
  try {
    const res = await fetchWithSupabaseSession(
      `/api/camiones/${encodeURIComponent(camionId)}/objetivos`,
      { cache: "no-store" }
    );
    const json = (await res.json()) as {
      success?: boolean;
      data?: { productos?: ObjetivoCamion[] };
      error?: string;
    };
    if (!res.ok || !json.success) {
      console.error("[repartos] getObjetivos:", json.error ?? res.statusText);
      return [];
    }
    return json.data?.productos ?? [];
  } catch (e) {
    console.error("[repartos] getObjetivos:", e);
    return [];
  }
}

/** Define el objetivo de carga por producto. `null` o 0 lo borra. */
export async function guardarObjetivos(
  camionId: string,
  items: { producto_id: string; objetivo: number | null }[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetchWithSupabaseSession(
      `/api/camiones/${encodeURIComponent(camionId)}/objetivos`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      }
    );
    const json = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !json.success) {
      return { ok: false, error: json.error ?? "No se pudieron guardar los objetivos." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red." };
  }
}

/** Quién puede salir con un camión. Ids de la tabla `usuarios` del schema. */
export async function getRepartidores(): Promise<RepartidorReparto[]> {
  try {
    const res = await fetchWithSupabaseSession("/api/repartos/repartidores", {
      cache: "no-store",
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { repartidores?: RepartidorReparto[] };
      error?: string;
    };
    if (!res.ok || !json.success) {
      console.error("[repartos] getRepartidores:", json.error ?? res.statusText);
      return [];
    }
    return json.data?.repartidores ?? [];
  } catch (e) {
    console.error("[repartos] getRepartidores:", e);
    return [];
  }
}
