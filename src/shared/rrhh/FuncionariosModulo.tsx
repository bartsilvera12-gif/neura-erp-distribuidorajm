"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Users } from "lucide-react";
import ModalCaja from "@/shared/caja/ModalCaja";
import MontoInput from "@/components/ui/MontoInput";
import FechaSelect from "@/components/ui/FechaSelect";
import RrhhTabs from "./RrhhTabs";
import { gs, fechaCorta, inputCls, rrhhApi, useFuncionarios, type Funcionario } from "./api";

/**
 * RRHH → Funcionarios. Es la planilla del personal (no hace falta que tengan
 * usuario del sistema): de acá salen los pagos de salario y de IPS de cada mes.
 */
export default function FuncionariosModulo() {
  const { funcionarios, isLoading, error, mutate } = useFuncionarios();
  const [busca, setBusca] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const [editando, setEditando] = useState<Funcionario | "nuevo" | null>(null);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return funcionarios.filter(
      (f) =>
        (verInactivos || f.estado === "activo") &&
        (!q || `${f.nombre} ${f.apellido ?? ""} ${f.ci ?? ""} ${f.cargo ?? ""}`.toLowerCase().includes(q))
    );
  }, [funcionarios, busca, verInactivos]);

  const activos = funcionarios.filter((f) => f.estado === "activo");
  const totalSalarios = activos.reduce((s, f) => s + f.salario_base, 0);

  return (
    <div className="mx-auto max-w-6xl p-4 pb-24 sm:p-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            <Users className="h-6 w-6 text-slate-400" />
            Funcionarios
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {activos.length} activos · salarios del mes {gs(totalSalarios)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditando("nuevo")}
          className="flex items-center gap-2 rounded-xl bg-[#4FAEB2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#3f9599]"
        >
          <Plus className="h-4 w-4" />
          Nuevo funcionario
        </button>
      </header>

      <RrhhTabs />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nombre, cédula o cargo…"
            className={`${inputCls} pl-9`}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
          Mostrar inactivos
        </label>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error.message}</p>
      ) : isLoading ? (
        <p className="py-8 text-sm text-slate-400">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          {funcionarios.length === 0 ? "Todavía no hay funcionarios cargados." : "No hay resultados."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Nombre y apellido</th>
                <th className="px-4 py-3">C.I.</th>
                <th className="px-4 py-3">Cargo</th>
                <th className="px-4 py-3">Ingreso</th>
                <th className="px-4 py-3 text-right">Salario</th>
                <th className="px-4 py-3 text-center">IPS</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((f) => (
                <tr key={f.id} className={f.estado === "inactivo" ? "text-slate-400" : "text-slate-800"}>
                  <td className="px-4 py-3 font-medium">
                    {f.nombre} {f.apellido ?? ""}
                    {f.telefono ? <span className="block text-xs font-normal text-slate-400">{f.telefono}</span> : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{f.ci ?? "—"}</td>
                  <td className="px-4 py-3">{f.cargo ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{fechaCorta(f.fecha_ingreso)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{gs(f.salario_base)}</td>
                  <td className="px-4 py-3 text-center">{f.aporta_ips ? "Sí" : "No"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        f.estado === "activo" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {f.estado === "activo" ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setEditando(f)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando ? (
        <FormFuncionario
          inicial={editando === "nuevo" ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            void mutate();
          }}
        />
      ) : null}
    </div>
  );
}

function FormFuncionario({
  inicial,
  onCerrar,
  onGuardado,
}: {
  inicial: Funcionario | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [f, setF] = useState({
    nombre: inicial?.nombre ?? "",
    apellido: inicial?.apellido ?? "",
    ci: inicial?.ci ?? "",
    cargo: inicial?.cargo ?? "",
    telefono: inicial?.telefono ?? "",
    fecha_ingreso: inicial?.fecha_ingreso ?? "",
    salario_base: inicial?.salario_base ?? 0,
    aporta_ips: inicial?.aporta_ips ?? true,
    estado: inicial?.estado ?? "activo",
    observaciones: inicial?.observaciones ?? "",
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((o) => ({ ...o, [k]: v }));

  async function guardar() {
    setError(null);
    if (!f.nombre.trim()) return setError("Poné el nombre.");
    setGuardando(true);
    try {
      await rrhhApi(inicial ? `/api/rrhh/funcionarios/${inicial.id}` : "/api/rrhh/funcionarios", {
        method: inicial ? "PATCH" : "POST",
        body: f,
      });
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ModalCaja
      titulo={inicial ? "Editar funcionario" : "Nuevo funcionario"}
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" onClick={onCerrar} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3f9599] disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Nombre *">
          <input className={inputCls} value={f.nombre} onChange={(e) => set("nombre", e.target.value)} autoFocus />
        </Campo>
        <Campo label="Apellido">
          <input className={inputCls} value={f.apellido} onChange={(e) => set("apellido", e.target.value)} />
        </Campo>
        <Campo label="Cédula (C.I.)">
          <input className={inputCls} value={f.ci} onChange={(e) => set("ci", e.target.value)} inputMode="numeric" />
        </Campo>
        <Campo label="Teléfono">
          <input className={inputCls} value={f.telefono} onChange={(e) => set("telefono", e.target.value)} />
        </Campo>
        <Campo label="Cargo">
          <input className={inputCls} value={f.cargo} onChange={(e) => set("cargo", e.target.value)} placeholder="Ej.: CAJERO, CHOFER" />
        </Campo>
        <Campo label="Fecha de ingreso">
          <FechaSelect className={inputCls} value={f.fecha_ingreso} onChange={(e) => set("fecha_ingreso", e.target.value)} />
        </Campo>
        <Campo label="Salario mensual (Gs.)">
          <MontoInput className={inputCls} value={f.salario_base} onChange={(n) => set("salario_base", n)} decimals={false} />
        </Campo>
        <Campo label="Estado">
          <select className={inputCls} value={f.estado} onChange={(e) => set("estado", e.target.value as "activo" | "inactivo")}>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo (ya no trabaja)</option>
          </select>
        </Campo>
        <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={f.aporta_ips} onChange={(e) => set("aporta_ips", e.target.checked)} />
          Aporta al IPS
        </label>
        <Campo label="Observaciones" className="col-span-2">
          <textarea className={inputCls} rows={2} value={f.observaciones} onChange={(e) => set("observaciones", e.target.value)} />
        </Campo>
      </div>
      {error ? <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{error}</p> : null}
    </ModalCaja>
  );
}

/**
 * Etiqueta + campo. `div` para un combo (SmartCombobox): dentro de un label,
 * el clic en una opción se reenvía al botón del combo y lo vuelve a abrir.
 */
export function Campo({
  label,
  children,
  className = "",
  div = false,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  div?: boolean;
}) {
  const Tag = div ? "div" : "label";
  return (
    <Tag className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </Tag>
  );
}
