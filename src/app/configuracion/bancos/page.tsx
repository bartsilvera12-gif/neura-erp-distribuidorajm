"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { GlobalConfigSubpageShell } from "@/components/config/GlobalConfigSubpageShell";
import {
  ConfigFormCard,
  ConfigHelpText,
  ConfigSectionTitle,
  F_INPUT,
  F_LABEL,
} from "@/components/config/global-config-primitives";
import { apiFetch } from "@/lib/api/fetch-with-supabase-session";

type Banco = {
  id: string;
  codigo: string | null;
  nombre: string;
  tipo: string;
  activo: boolean;
  sort_order: number;
};
type Resp = { success?: boolean; error?: string; data?: { bancos: Banco[]; meta: { can_edit: boolean } } };

/** Mismo orden que acepta la API. */
const TIPOS: { valor: string; etiqueta: string }[] = [
  { valor: "banco", etiqueta: "Banco" },
  { valor: "billetera", etiqueta: "Billetera electrónica" },
  { valor: "financiera", etiqueta: "Financiera" },
  { valor: "cooperativa", etiqueta: "Cooperativa" },
];
const etiquetaTipo = (t: string) => TIPOS.find((x) => x.valor === t)?.etiqueta ?? "Banco";

const BTN_PRIMARY =
  "rounded-lg bg-[#3F8E91] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#357a7d] disabled:opacity-50";
const BTN_EDITAR =
  "inline-flex items-center gap-1 rounded-lg border border-[#4FAEB2]/40 bg-[#4FAEB2]/5 px-2.5 py-1 text-xs font-medium text-[#3F8E91] transition-colors hover:bg-[#4FAEB2]/15 disabled:opacity-50";
const BTN_ELIMINAR =
  "inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-100 disabled:opacity-50";
const BTN_GHOST =
  "rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50";
const TH = "px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500";

/** Interruptor de activo/inactivo. */
function Interruptor({
  activo,
  onToggle,
  disabled,
}: {
  activo: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={activo ? "Desactivar" : "Activar"}
        onClick={onToggle}
        disabled={disabled}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
          activo ? "bg-emerald-500" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            activo ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
      <span className={`text-xs ${activo ? "text-slate-700" : "text-slate-400"}`}>{activo ? "Sí" : "No"}</span>
    </span>
  );
}

export default function ConfiguracionBancosPage() {
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Alta
  const [nCodigo, setNCodigo] = useState("");
  const [nNombre, setNNombre] = useState("");
  const [nTipo, setNTipo] = useState("banco");

  // Edición en la fila
  const [editId, setEditId] = useState<string | null>(null);
  const [eCodigo, setECodigo] = useState("");
  const [eNombre, setENombre] = useState("");
  const [eTipo, setETipo] = useState("banco");

  // Confirmación de borrado
  const [porBorrar, setPorBorrar] = useState<Banco | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await apiFetch("/api/configuracion/bancos", { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as Resp;
      if (!r.ok || !j.success || !j.data) {
        setError(j.error ?? `Error ${r.status}`);
        return;
      }
      setBancos(j.data.bancos);
      setCanEdit(j.data.meta.can_edit);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function crear() {
    const nombre = nNombre.trim();
    if (!nombre) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await apiFetch("/api/configuracion/bancos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, codigo: nCodigo.trim(), tipo: nTipo }),
      });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!r.ok || !j.success) {
        setError(j.error ?? `Error ${r.status}`);
        return;
      }
      setNCodigo("");
      setNNombre("");
      setNTipo("banco");
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    const r = await apiFetch(`/api/configuracion/bancos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string };
    if (!r.ok || !j.success) {
      setError(j.error ?? `Error ${r.status}`);
      return;
    }
    setEditId(null);
    await cargar();
  }

  async function borrar(b: Banco) {
    setError(null);
    setPorBorrar(null);
    const r = await apiFetch(`/api/configuracion/bancos/${b.id}`, { method: "DELETE" });
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string };
    if (!r.ok || !j.success) {
      setError(j.error ?? `Error ${r.status}`);
      return;
    }
    await cargar();
  }

  function abrirEdicion(b: Banco) {
    setEditId(b.id);
    setECodigo(b.codigo ?? "");
    setENombre(b.nombre);
    setETipo(b.tipo);
  }

  const colspan = canEdit ? 5 : 4;

  return (
    <GlobalConfigSubpageShell
      title="Bancos"
      eyebrow="Finanzas"
      description="Catálogo de entidades de origen para los cobros por transferencia. Esta lista alimenta el desplegable “Banco de origen” de los botones de cobro."
    >
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {canEdit ? (
        <ConfigFormCard>
          <ConfigSectionTitle>Nueva entidad</ConfigSectionTitle>
          <ConfigHelpText>
            El nombre no se puede repetir, y el código tampoco si lo cargás. Las entidades desactivadas no aparecen en el
            desplegable de cobros.
          </ConfigHelpText>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={F_LABEL} htmlFor="b-codigo">Código</label>
              <input
                id="b-codigo"
                className={`${F_INPUT} uppercase placeholder:normal-case`}
                value={nCodigo}
                onChange={(e) => setNCodigo(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter") void crear(); }}
                placeholder="Ej: BASA"
              />
            </div>
            <div>
              <label className={F_LABEL} htmlFor="b-nombre">Nombre *</label>
              <input
                id="b-nombre"
                className={F_INPUT}
                value={nNombre}
                onChange={(e) => setNNombre(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void crear(); }}
                placeholder="Ej: Banco Basa"
              />
            </div>
            <div>
              <label className={F_LABEL} htmlFor="b-tipo">Tipo</label>
              <select id="b-tipo" className={F_INPUT} value={nTipo} onChange={(e) => setNTipo(e.target.value)}>
                {TIPOS.map((t) => (
                  <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <button type="button" className={BTN_PRIMARY} onClick={() => void crear()} disabled={guardando || !nNombre.trim()}>
              {guardando ? "Creando…" : "Crear entidad"}
            </button>
          </div>
        </ConfigFormCard>
      ) : null}

      <ConfigFormCard>
        <ConfigSectionTitle>Entidades ({bancos.length})</ConfigSectionTitle>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className={TH}>Código</th>
                  <th className={TH}>Nombre</th>
                  <th className={TH}>Tipo</th>
                  <th className={TH}>Activo</th>
                  {canEdit ? <th className={TH}>Acciones</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cargando ? (
                  <tr>
                    <td colSpan={colspan} className="px-3 py-8 text-center text-sm text-slate-400">Cargando…</td>
                  </tr>
                ) : bancos.length === 0 ? (
                  <tr>
                    <td colSpan={colspan} className="px-3 py-8 text-center text-sm text-slate-500">
                      No hay entidades cargadas todavía.
                    </td>
                  </tr>
                ) : (
                  bancos.map((b) =>
                    editId === b.id ? (
                      <tr key={b.id} className="bg-[#4FAEB2]/5">
                        <td className="px-3 py-2">
                          <input
                            className={`${F_INPUT} uppercase`}
                            value={eCodigo}
                            onChange={(e) => setECodigo(e.target.value.toUpperCase())}
                            aria-label="Código"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className={F_INPUT}
                            value={eNombre}
                            onChange={(e) => setENombre(e.target.value)}
                            aria-label="Nombre"
                            autoFocus
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select className={F_INPUT} value={eTipo} onChange={(e) => setETipo(e.target.value)} aria-label="Tipo">
                            {TIPOS.map((t) => (
                              <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-400">—</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={BTN_PRIMARY}
                              onClick={() => void patch(b.id, { nombre: eNombre, codigo: eCodigo, tipo: eTipo })}
                              disabled={!eNombre.trim()}
                            >
                              Guardar
                            </button>
                            <button type="button" className={BTN_GHOST} onClick={() => setEditId(null)}>Cancelar</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={b.id} className="transition-colors hover:bg-slate-50/60">
                        <td className="px-3 py-3 font-mono text-xs text-slate-500">{b.codigo ?? "—"}</td>
                        <td className={`px-3 py-3 ${b.activo ? "text-slate-800" : "text-slate-400"}`}>{b.nombre}</td>
                        <td className="px-3 py-3 text-xs text-slate-600">{etiquetaTipo(b.tipo)}</td>
                        <td className="px-3 py-3">
                          {canEdit ? (
                            <Interruptor activo={b.activo} onToggle={() => void patch(b.id, { activo: !b.activo })} />
                          ) : (
                            <span className="text-xs text-slate-600">{b.activo ? "Sí" : "No"}</span>
                          )}
                        </td>
                        {canEdit ? (
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-2">
                              <button type="button" className={BTN_EDITAR} onClick={() => abrirEdicion(b)}>
                                <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar
                              </button>
                              <button type="button" className={BTN_ELIMINAR} onClick={() => setPorBorrar(b)}>
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Eliminar
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      </ConfigFormCard>

      {porBorrar ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-slate-800">Eliminar «{porBorrar.nombre}»</h2>
            <p className="mt-2 text-sm text-slate-600">
              Se saca del desplegable de cobros. Los cobros ya registrados con esta entidad no se modifican: guardan el
              nombre por su cuenta.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Si solo querés que deje de ofrecerse, es preferible <strong>desactivarla</strong> con el interruptor.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={BTN_GHOST} onClick={() => setPorBorrar(null)}>Cancelar</button>
              <button
                type="button"
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700"
                onClick={() => void borrar(porBorrar)}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </GlobalConfigSubpageShell>
  );
}
