"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfigFormCard, ConfigSectionTitle } from "@/components/config/global-config-primitives";
import { GlobalConfigSubpageShell } from "@/components/config/GlobalConfigSubpageShell";
import { apiFetch } from "@/lib/api/fetch-with-supabase-session";
import {
  createEtapa,
  deleteEtapa,
  getEtapasParaConfig,
  getEtapaClasses,
  updateEtapa,
  type EtapaCrm,
} from "@/lib/crm/etapas";


const FUENTE_ETAPAS_CONFIG =
  "GET /api/crm/etapas?config=1 → tabla crm_etapas (misma capa de datos que el Funnel; el dashboard no define etapas)";

export default function ConfiguracionCrmPipelinePage() {
  const [rolCargado, setRolCargado] = useState(false);
  const [puedeConfig, setPuedeConfig] = useState(false);
  const [rolDetectado, setRolDetectado] = useState<string | null>(null);
  const [empresaIdCtx, setEmpresaIdCtx] = useState<string | null>(null);
  const [etapasCrm, setEtapasCrm] = useState<EtapaCrm[]>([]);
  const [nuevaEtapa, setNuevaEtapa] = useState({ nombre: "", codigo: "", color: "gray", orden: 0 });
  const [editandoEtapa, setEditandoEtapa] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/auth/empresa-context", { cache: "no-store" });
        const j = (await res.json()) as {
          success?: boolean;
          data?: { es_admin?: boolean; rol?: string | null; empresa_id?: string | null };
        };
        if (cancelled) return;
        if (res.ok && j.success && j.data) {
          setPuedeConfig(Boolean(j.data.es_admin));
          setRolDetectado(j.data.rol != null && j.data.rol !== "" ? String(j.data.rol) : null);
          setEmpresaIdCtx(j.data.empresa_id != null && j.data.empresa_id !== "" ? String(j.data.empresa_id) : null);
        } else {
          setPuedeConfig(false);
        }
      } catch {
        if (!cancelled) setPuedeConfig(false);
      } finally {
        if (!cancelled) setRolCargado(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !rolCargado) return;
    console.debug("[config-crm] diagnóstico", {
      rol_detectado: rolDetectado,
      es_admin: puedeConfig,
      empresa_id: empresaIdCtx,
      fuente_etapas: FUENTE_ETAPAS_CONFIG,
      n_etapas: etapasCrm.length,
    });
  }, [rolCargado, rolDetectado, puedeConfig, empresaIdCtx, etapasCrm.length]);

  const loadEtapas = useCallback(() => {
    void getEtapasParaConfig().then(setEtapasCrm);
  }, []);

  useEffect(() => {
    loadEtapas();
  }, [loadEtapas]);

  return (
    <GlobalConfigSubpageShell
      title="Configuración CRM"
      description="Etapas del pipeline comercial."
    >
      <div className="space-y-5">
        {/* ── Funnel: siempre se ve el listado; edición con rol admin ── */}
        <ConfigFormCard>
          <ConfigSectionTitle>Estados del pipeline CRM</ConfigSectionTitle>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            Columnas del embudo comercial. Si no tenés rol de administrador, la lista se muestra solo para referencia; no
            podés modificar.
          </p>
          {rolCargado && !puedeConfig && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
              <strong>Modo solo lectura</strong> para el pipeline. Para crear o editar etapas hace falta un rol de
              administración en el catálogo (misma regla que Facturación).{" "}
              <span className="block pt-1 text-amber-950/90">
                Rol detectado en catálogo: <span className="font-mono">{rolDetectado ?? "—"}</span>
              </span>
            </div>
          )}
          {!rolCargado && (
            <p className="mb-3 text-sm text-slate-400" role="status">
              Cargando permisos…
            </p>
          )}

          <p className="mb-4 text-xs leading-relaxed text-slate-400">
            Definí las etapas (columnas) del pipeline. Cada empresa tiene sus propias etapas.
          </p>
          <div className="space-y-4">
            {etapasCrm.length === 0 && rolCargado && (
              <p className="text-sm text-slate-500">Aún no hay etapas definidas. {puedeConfig && "Podés crear la primera abajo."}</p>
            )}
            {etapasCrm.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                <span className={`h-3 w-3 shrink-0 rounded-full ${getEtapaClasses(e.color).dot}`} />
                <div className="min-w-0 flex-1">
                  {puedeConfig && editandoEtapa === e.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        defaultValue={e.nombre}
                        id={`edit-nombre-${e.id}`}
                        className="w-32 rounded border px-2 py-1 text-sm"
                      />
                      <select id={`edit-color-${e.id}`} defaultValue={e.color} className="rounded border px-2 py-1 text-sm">
                        {["gray", "blue", "amber", "green", "red", "violet", "cyan", "pink"].map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        id={`edit-orden-${e.id}`}
                        defaultValue={e.orden}
                        className="w-16 rounded border px-2 py-1 text-sm"
                      />
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" id={`edit-activo-${e.id}`} defaultChecked={e.activo} />
                        Activo
                      </label>
                      <button
                        type="button"
                        onClick={async () => {
                          const nombre = (document.getElementById(`edit-nombre-${e.id}`) as HTMLInputElement)?.value?.trim();
                          const color = (document.getElementById(`edit-color-${e.id}`) as HTMLSelectElement)?.value;
                          const orden = parseInt(
                            (document.getElementById(`edit-orden-${e.id}`) as HTMLInputElement)?.value ?? "0",
                            10
                          );
                          const activo = (document.getElementById(`edit-activo-${e.id}`) as HTMLInputElement)?.checked ?? true;
                          if (nombre) await updateEtapa(e.id, { nombre, color, orden, activo });
                          setEditandoEtapa(null);
                          loadEtapas();
                        }}
                        className="text-xs font-medium text-green-600 hover:text-green-800"
                      >
                        Guardar
                      </button>
                      <button type="button" onClick={() => setEditandoEtapa(null)} className="text-xs text-slate-500">
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="font-medium text-slate-800">{e.nombre}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        ({e.codigo}) · orden {e.orden}
                      </span>
                      {!e.activo && <span className="ml-1 text-xs text-amber-600">· Inactivo</span>}
                    </>
                  )}
                </div>
                {puedeConfig && editandoEtapa !== e.id && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => setEditandoEtapa(e.id)}
                      className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-white hover:text-slate-800"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (confirm("¿Eliminar esta etapa? Los prospectos en esta etapa quedarán sin etapa asignada.")) {
                          await deleteEtapa(e.id);
                          loadEtapas();
                        }
                      }}
                      className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-800"
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {puedeConfig && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <h5 className="mb-2 text-xs font-semibold text-slate-600">Crear nueva etapa</h5>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-0.5 block text-[10px] text-slate-500">Nombre</label>
                  <input
                    type="text"
                    value={nuevaEtapa.nombre}
                    onChange={(ev) =>
                      setNuevaEtapa((prev) => ({
                        ...prev,
                        nombre: ev.target.value,
                        codigo: ev.target.value.replace(/\s+/g, "_").toUpperCase(),
                      }))
                    }
                    placeholder="Ej: Calificación"
                    className="w-32 rounded border px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] text-slate-500">Color</label>
                  <select
                    value={nuevaEtapa.color}
                    onChange={(ev) => setNuevaEtapa((prev) => ({ ...prev, color: ev.target.value }))}
                    className="rounded border px-2 py-1.5 text-sm"
                  >
                    {["gray", "blue", "amber", "green", "red", "violet", "cyan", "pink"].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] text-slate-500">Orden</label>
                  <input
                    type="number"
                    value={nuevaEtapa.orden || ""}
                    onChange={(ev) => setNuevaEtapa((prev) => ({ ...prev, orden: parseInt(ev.target.value, 10) || 0 }))}
                    className="w-16 rounded border px-2 py-1.5 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!nuevaEtapa.nombre.trim()) return;
                    const codigo = nuevaEtapa.codigo || nuevaEtapa.nombre.replace(/\s+/g, "_").toUpperCase();
                    const orden = nuevaEtapa.orden ?? (Math.max(0, ...etapasCrm.map((x) => x.orden), 0) + 1);
                    await createEtapa({ nombre: nuevaEtapa.nombre.trim(), codigo, color: nuevaEtapa.color, orden });
                    setNuevaEtapa({ nombre: "", codigo: "", color: "gray", orden: 0 });
                    loadEtapas();
                  }}
                  className="rounded bg-[#4FAEB2] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3F8E91]"
                >
                  Crear etapa
                </button>
              </div>
            </div>
          )}
        </ConfigFormCard>

      </div>
    </GlobalConfigSubpageShell>
  );
}
