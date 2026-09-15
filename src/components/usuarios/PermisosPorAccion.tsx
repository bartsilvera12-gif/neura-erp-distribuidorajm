"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { CATALOGO_PERMISOS, type Accion } from "@/lib/usuarios/permisos";

type Fila = { accion: Accion; permitido: boolean; por_defecto: boolean };

/**
 * Permisos por acción de un usuario (documento v0.2, pág. 10).
 *
 * Cada casilla arranca en lo que el rol permite. Lo que se marque distinto se
 * guarda como excepción: así, si mañana a esa persona se le cambia el rol, sus
 * permisos se mueven con el rol nuevo en vez de quedar congelados en lo que
 * alguien marcó una vez.
 *
 * Solo aparecen acciones que el servidor realmente chequea. Una casilla que no
 * bloquea nada es peor que no tenerla: se lee como un control que no existe.
 */
export default function PermisosPorAccion({ usuarioId }: { usuarioId: string }) {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [disponible, setDisponible] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetchWithSupabaseSession(
          `/api/empresas/usuarios/${encodeURIComponent(usuarioId)}/permisos`,
          { cache: "no-store" }
        );
        const json = (await res.json()) as {
          success?: boolean;
          data?: { disponible?: boolean; permisos?: Fila[] };
          error?: string;
        };
        if (!vivo) return;
        if (!res.ok || !json.success) {
          setError(json.error ?? "No se pudieron cargar los permisos.");
          setFilas([]);
          return;
        }
        setDisponible(json.data?.disponible !== false);
        setFilas(json.data?.permisos ?? []);
      } catch {
        if (vivo) {
          setError("No se pudieron cargar los permisos.");
          setFilas([]);
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [usuarioId]);

  function alternar(accion: Accion) {
    setMensaje(null);
    setError(null);
    setFilas((prev) =>
      (prev ?? []).map((f) => (f.accion === accion ? { ...f, permitido: !f.permitido } : f))
    );
  }

  async function guardar() {
    if (guardando || !filas) return;
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      const res = await fetchWithSupabaseSession(
        `/api/empresas/usuarios/${encodeURIComponent(usuarioId)}/permisos`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            permisos: filas.map((f) => ({ accion: f.accion, permitido: f.permitido })),
          }),
        }
      );
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        setError(json.error ?? "No se pudieron guardar los permisos.");
        return;
      }
      setMensaje("Permisos guardados.");
    } catch {
      setError("No se pudieron guardar los permisos.");
    } finally {
      setGuardando(false);
    }
  }

  if (filas === null) {
    return <p className="py-4 text-sm text-slate-400">Cargando permisos…</p>;
  }

  if (!disponible) {
    return (
      <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
        Falta la migración de permisos (<code>11_permisos_por_accion.sql</code>). Hasta correrla,
        cada usuario puede lo que su rol permite.
      </p>
    );
  }

  const porAccion = new Map(filas.map((f) => [f.accion, f]));

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-slate-500">
        Cada permiso arranca en lo que permite el rol. Lo que cambies se guarda como excepción de
        esta persona.
      </p>

      {CATALOGO_PERMISOS.map((grupo) => (
        <div key={grupo.grupo}>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {grupo.grupo}
          </p>
          <ul className="space-y-1.5">
            {grupo.acciones.map(({ accion, label, ayuda }) => {
              const f = porAccion.get(accion);
              if (!f) return null;
              const cambiado = f.permitido !== f.por_defecto;
              return (
                <li key={accion}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={f.permitido}
                      onChange={() => alternar(accion)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#4FAEB2]"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800">
                        {label}
                        {cambiado ? (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                            excepción
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-xs text-slate-500">{ayuda}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {mensaje ? (
        <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">{mensaje}</p>
      ) : null}

      <button
        type="button"
        onClick={guardar}
        disabled={guardando}
        className="rounded-xl bg-[#4FAEB2] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {guardando ? "Guardando…" : "Guardar permisos"}
      </button>
    </div>
  );
}
