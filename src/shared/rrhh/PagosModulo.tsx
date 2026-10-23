"use client";

import { useMemo, useState } from "react";
import { Banknote, CheckCircle2, Pencil, Plus, Printer, ShieldCheck, Trash2, Wand2 } from "lucide-react";
import ModalCaja from "@/shared/caja/ModalCaja";
import MontoInput from "@/components/ui/MontoInput";
import FechaSelect from "@/components/ui/FechaSelect";
import SmartCombobox from "@/components/ui/SmartCombobox";
import RrhhTabs from "./RrhhTabs";
import { Campo } from "./FuncionariosModulo";
import {
  fechaCorta,
  gs,
  hoyIso,
  inputCls,
  nombrePeriodo,
  periodoActual,
  rrhhApi,
  useFuncionarios,
  usePagos,
  type Pago,
  type TipoPago,
} from "./api";

const miles = (n: number) => Math.round(n || 0).toLocaleString("es-PY");

const IPS_OBRERO = 0.09;
const IPS_PATRONAL = 0.165;

const TEXTOS: Record<TipoPago, { titulo: string; sub: string; generar: string }> = {
  salario: {
    titulo: "Pagos de salarios",
    sub: "Un pago por funcionario y por mes.",
    generar: "Cargar salarios del mes",
  },
  ips: {
    titulo: "Pagos de IPS",
    sub: "Aporte obrero 9% + aporte patronal 16,5% sobre el salario.",
    generar: "Cargar IPS del mes",
  },
};

/** RRHH → Pagos de salarios / Pagos de IPS (misma pantalla, distinto tipo). */
export default function PagosModulo({ tipo }: { tipo: TipoPago }) {
  const t = TEXTOS[tipo];
  const esIps = tipo === "ips";
  const [periodo, setPeriodo] = useState(periodoActual());
  const [estado, setEstado] = useState("");
  const { pagos, isLoading, error, mutate } = usePagos(tipo, periodo, estado);
  const [modal, setModal] = useState<{ modo: "nuevo" } | { modo: "editar" | "pagar"; pago: Pago } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const hoy = hoyIso();

  const totales = useMemo(() => {
    let pendiente = 0;
    let pagado = 0;
    for (const p of pagos) {
      if (p.estado === "pagado") pagado += p.monto;
      else pendiente += p.monto;
    }
    return { pendiente, pagado };
  }, [pagos]);

  async function generar() {
    if (!periodo) return setAviso("Elegí el mes primero.");
    setTrabajando(true);
    setAviso(null);
    try {
      const r = await rrhhApi<{ creados: number }>(`/api/rrhh/pagos/${tipo}`, { method: "POST", body: { generar: true, periodo } });
      setAviso(
        r.creados > 0
          ? `Se cargaron ${r.creados} pagos pendientes de ${nombrePeriodo(periodo)}.`
          : `Todos los funcionarios activos ya tienen su pago de ${nombrePeriodo(periodo)}.`
      );
      void mutate();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo cargar el mes.");
    } finally {
      setTrabajando(false);
    }
  }

  async function borrar(p: Pago) {
    if (!window.confirm(`¿Borrar el pago de ${p.funcionario_nombre} (${nombrePeriodo(p.periodo)})?`)) return;
    try {
      await rrhhApi(`/api/rrhh/pagos/${tipo}/${p.id}`, { method: "DELETE" });
      void mutate();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo borrar.");
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4 pb-24 sm:p-6">
      <header className="no-imprimir mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            {esIps ? <ShieldCheck className="h-6 w-6 text-slate-400" /> : <Banknote className="h-6 w-6 text-slate-400" />}
            {t.titulo}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">{t.sub}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={generar}
            disabled={trabajando}
            title="Crea el pago pendiente de cada funcionario activo que todavía no lo tenga"
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Wand2 className="h-4 w-4" />
            {t.generar}
          </button>
          <button
            type="button"
            onClick={() => setModal({ modo: "nuevo" })}
            className="flex items-center gap-2 rounded-xl bg-[#4FAEB2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#3f9599]"
          >
            <Plus className="h-4 w-4" />
            Nuevo pago
          </button>
        </div>
      </header>

      <div className="no-imprimir">
        <RrhhTabs />
      </div>

      <div className="no-imprimir mb-3 flex flex-wrap items-end gap-3">
        <Campo label="Mes">
          <SelectPeriodo className={`${inputCls} w-48`} value={periodo} onChange={setPeriodo} conTodos />
        </Campo>
        <Campo label="Estado">
          <select className={`${inputCls} w-40`} value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="pendiente">Pendientes</option>
            <option value="pagado">Pagados</option>
          </select>
        </Campo>
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Printer className="h-4 w-4" />
          Imprimir
        </button>
      </div>

      {aviso ? <p className="no-imprimir mb-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{aviso}</p> : null}

      <div className="factura-imprimible">
        <div className="mb-3 hidden print:block">
          <p className="text-lg font-bold">{t.titulo}</p>
          <p className="text-sm">{periodo ? nombrePeriodo(periodo) : "Todos los meses"}</p>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-700">Pendiente</p>
            <p className="text-lg font-bold tabular-nums text-amber-900">{gs(totales.pendiente)}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-semibold text-emerald-700">Pagado</p>
            <p className="text-lg font-bold tabular-nums text-emerald-900">{gs(totales.pagado)}</p>
          </div>
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error.message}</p>
        ) : isLoading ? (
          <p className="py-8 text-sm text-slate-400">Cargando…</p>
        ) : pagos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            No hay pagos {periodo ? `de ${nombrePeriodo(periodo)}` : "cargados"}. Usá «{t.generar}» para cargar los de todos los
            funcionarios activos.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Nombre y apellido</th>
                  <th className="px-3 py-3">Mes / año</th>
                  {esIps ? <th className="px-3 py-3">Vencimiento</th> : null}
                  <th className="px-3 py-3">Fecha de pago</th>
                  <th className="px-3 py-3 text-right">Importe (Gs.)</th>
                  <th className="px-3 py-3">Estado</th>
                  <th className="no-imprimir px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagos.map((p) => {
                  const vencido = esIps && p.estado === "pendiente" && !!p.fecha_vencimiento && p.fecha_vencimiento < hoy;
                  return (
                    <tr key={p.id} className="text-slate-800">
                      <td className="px-3 py-3 font-medium">
                        {p.funcionario_nombre}
                        {p.observaciones ? (
                          <span className="block max-w-56 truncate text-xs font-normal text-slate-400">{p.observaciones}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 tabular-nums">{p.periodo.slice(5)}/{p.periodo.slice(0, 4)}</td>
                      {esIps ? (
                        <td className={`px-3 py-3 tabular-nums ${vencido ? "font-semibold text-red-600" : ""}`}>
                          {fechaCorta(p.fecha_vencimiento)}
                        </td>
                      ) : null}
                      <td className="px-3 py-3 tabular-nums">{fechaCorta(p.fecha_pago)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <span className="font-semibold">{miles(p.monto)}</span>
                        {esIps ? (
                          <span className="block text-xs text-slate-400">
                            9% {miles(p.aporte_obrero ?? 0)} · 16,5% {miles(p.aporte_patronal ?? 0)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            p.estado === "pagado"
                              ? "bg-emerald-50 text-emerald-700"
                              : vencido
                                ? "bg-red-50 text-red-700"
                                : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {p.estado === "pagado" ? "Pagado" : vencido ? "Vencido" : "Pendiente"}
                        </span>
                      </td>
                      <td className="no-imprimir whitespace-nowrap px-3 py-3 text-right">
                        {p.estado === "pendiente" ? (
                          <button
                            type="button"
                            onClick={() => setModal({ modo: "pagar", pago: p })}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Pagar
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setModal({ modo: "editar", pago: p })}
                          title="Editar"
                          aria-label="Editar"
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {p.estado === "pendiente" ? (
                          <button
                            type="button"
                            onClick={() => borrar(p)}
                            title="Borrar"
                            aria-label="Borrar"
                            className="inline-flex items-center rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal?.modo === "nuevo" ? (
        <NuevoPago
          tipo={tipo}
          periodoInicial={periodo || periodoActual()}
          onCerrar={() => setModal(null)}
          onGuardado={() => {
            setModal(null);
            void mutate();
          }}
        />
      ) : modal ? (
        <EditarPago
          tipo={tipo}
          pago={modal.pago}
          pagar={modal.modo === "pagar"}
          onCerrar={() => setModal(null)}
          onGuardado={() => {
            setModal(null);
            void mutate();
          }}
        />
      ) : null}
    </div>
  );
}

function Pie({ onCerrar, onGuardar, guardando, texto }: { onCerrar: () => void; onGuardar: () => void; guardando: boolean; texto: string }) {
  return (
    <>
      <button type="button" onClick={onCerrar} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
        Cancelar
      </button>
      <button
        type="button"
        onClick={onGuardar}
        disabled={guardando}
        className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3f9599] disabled:opacity-50"
      >
        {guardando ? "Guardando…" : texto}
      </button>
    </>
  );
}

function NuevoPago({
  tipo,
  periodoInicial,
  onCerrar,
  onGuardado,
}: {
  tipo: TipoPago;
  periodoInicial: string;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const esIps = tipo === "ips";
  const { funcionarios } = useFuncionarios();
  const opciones = useMemo(
    () =>
      funcionarios
        .filter((f) => f.estado === "activo" && (!esIps || f.aporta_ips))
        .map((f) => ({ id: f.id, label: `${f.nombre} ${f.apellido ?? ""}`.trim(), sub: f.ci ? `C.I. ${f.ci}` : null })),
    [funcionarios, esIps]
  );
  const [funcionarioId, setFuncionarioId] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState(periodoInicial);
  const [salario, setSalario] = useState(0);
  const [monto, setMonto] = useState(0);
  const [pagado, setPagado] = useState(false);
  const [fechaPago, setFechaPago] = useState(hoyIso());
  const [vencimiento, setVencimiento] = useState("");
  const [obs, setObs] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const obrero = Math.round(salario * IPS_OBRERO);
  const patronal = Math.round(salario * IPS_PATRONAL);

  function elegir(id: string | null) {
    setFuncionarioId(id);
    const f = funcionarios.find((x) => x.id === id);
    if (!f) return;
    setSalario(f.salario_base);
    setMonto(esIps ? Math.round(f.salario_base * IPS_OBRERO) + Math.round(f.salario_base * IPS_PATRONAL) : f.salario_base);
  }

  function cambiarSalario(n: number) {
    setSalario(n);
    setMonto(Math.round(n * IPS_OBRERO) + Math.round(n * IPS_PATRONAL));
  }

  async function guardar() {
    setError(null);
    if (!funcionarioId) return setError("Elegí el funcionario.");
    if (!/^\d{4}-\d{2}$/.test(periodo)) return setError("Elegí el mes.");
    setGuardando(true);
    try {
      await rrhhApi(`/api/rrhh/pagos/${tipo}`, {
        method: "POST",
        body: {
          funcionario_id: funcionarioId,
          periodo,
          monto,
          salario_imponible: esIps ? salario : undefined,
          fecha_vencimiento: esIps ? vencimiento || undefined : undefined,
          estado: pagado ? "pagado" : "pendiente",
          fecha_pago: pagado ? fechaPago : undefined,
          observaciones: obs,
        },
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
      titulo={esIps ? "Nuevo pago de IPS" : "Nuevo pago de salario"}
      onCerrar={onCerrar}
      pie={<Pie onCerrar={onCerrar} onGuardar={guardar} guardando={guardando} texto="Guardar" />}
    >
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Funcionario *" className="col-span-2" div>
          <SmartCombobox options={opciones} value={funcionarioId} onChange={elegir} placeholder="Buscar funcionario…" />
        </Campo>
        <Campo label="Mes *">
          <SelectPeriodo className={inputCls} value={periodo} onChange={setPeriodo} />
        </Campo>
        {esIps ? (
          <>
            <Campo label="Vencimiento">
              <FechaSelect className={inputCls} value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} />
            </Campo>
            <Campo label="Salario (Gs.)">
              <MontoInput className={inputCls} value={salario} onChange={cambiarSalario} decimals={false} />
            </Campo>
            <div className="self-end pb-2 text-xs text-slate-500">
              Obrero {gs(obrero)} + patronal {gs(patronal)}
            </div>
          </>
        ) : null}
        <Campo label="Importe (Gs.)" className={esIps ? "col-span-2" : ""}>
          <MontoInput className={inputCls} value={monto} onChange={setMonto} decimals={false} />
        </Campo>
        <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={pagado} onChange={(e) => setPagado(e.target.checked)} />
          Ya está pagado
        </label>
        {pagado ? (
          <Campo label="Fecha de pago">
            <FechaSelect className={inputCls} value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
          </Campo>
        ) : null}
        <Campo label="Observaciones" className="col-span-2">
          <input className={inputCls} value={obs} onChange={(e) => setObs(e.target.value)} />
        </Campo>
      </div>
      {esIps && !vencimiento ? (
        <p className="mt-2 text-xs text-slate-400">Sin vencimiento se pone el último día del mes siguiente.</p>
      ) : null}
      {error ? <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{error}</p> : null}
    </ModalCaja>
  );
}

function EditarPago({
  tipo,
  pago,
  pagar,
  onCerrar,
  onGuardado,
}: {
  tipo: TipoPago;
  pago: Pago;
  pagar: boolean;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const esIps = tipo === "ips";
  const [monto, setMonto] = useState(pago.monto);
  const [estado, setEstado] = useState<"pendiente" | "pagado">(pagar ? "pagado" : pago.estado);
  const [fechaPago, setFechaPago] = useState(pago.fecha_pago ?? hoyIso());
  const [vencimiento, setVencimiento] = useState(pago.fecha_vencimiento ?? "");
  const [obs, setObs] = useState(pago.observaciones ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    if (estado === "pagado" && !fechaPago) return setError("Poné la fecha de pago.");
    setGuardando(true);
    try {
      await rrhhApi(`/api/rrhh/pagos/${tipo}/${pago.id}`, {
        method: "PATCH",
        body: {
          monto,
          estado,
          fecha_pago: estado === "pagado" ? fechaPago : null,
          observaciones: obs,
          ...(esIps ? { fecha_vencimiento: vencimiento || null } : {}),
        },
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
      titulo={pagar ? "Registrar pago" : "Editar pago"}
      subtitulo={`${pago.funcionario_nombre} · ${nombrePeriodo(pago.periodo)}`}
      onCerrar={onCerrar}
      pie={<Pie onCerrar={onCerrar} onGuardar={guardar} guardando={guardando} texto={pagar ? "Marcar pagado" : "Guardar"} />}
    >
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Importe (Gs.)">
          <MontoInput className={inputCls} value={monto} onChange={setMonto} decimals={false} />
        </Campo>
        <Campo label="Estado">
          <select className={inputCls} value={estado} onChange={(e) => setEstado(e.target.value as "pendiente" | "pagado")}>
            <option value="pendiente">Pendiente</option>
            <option value="pagado">Pagado</option>
          </select>
        </Campo>
        {estado === "pagado" ? (
          <Campo label="Fecha de pago">
            <FechaSelect className={inputCls} value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
          </Campo>
        ) : null}
        {esIps ? (
          <Campo label="Vencimiento">
            <FechaSelect className={inputCls} value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} />
          </Campo>
        ) : null}
        <Campo label="Observaciones" className="col-span-2">
          <input className={inputCls} value={obs} onChange={(e) => setObs(e.target.value)} />
        </Campo>
      </div>
      {esIps && pago.salario_imponible ? (
        <p className="mt-2 text-xs text-slate-500">
          Salario {gs(pago.salario_imponible)} · obrero {gs(pago.aporte_obrero ?? 0)} · patronal {gs(pago.aporte_patronal ?? 0)}
        </p>
      ) : null}
      {error ? <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{error}</p> : null}
    </ModalCaja>
  );
}

/**
 * Mes / año como lista: el `<input type="month">` no existe en Firefox y vacío
 * se ve como rayitas. Ofrece desde 2 años atrás hasta 2 meses adelante.
 */
function SelectPeriodo({
  value,
  onChange,
  className,
  conTodos,
}: {
  value: string;
  onChange: (p: string) => void;
  className?: string;
  conTodos?: boolean;
}) {
  const opciones = useMemo(() => {
    const [a, m] = periodoActual().split("-").map(Number);
    const out: string[] = [];
    for (let i = 2; i >= -24; i--) {
      const d = new Date(Date.UTC(a, m - 1 + i, 1));
      out.push(d.toISOString().slice(0, 7));
    }
    if (value && !out.includes(value)) out.push(value);
    return out;
  }, [value]);
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      {conTodos ? <option value="">Todos los meses</option> : null}
      {opciones.map((p) => (
        <option key={p} value={p}>
          {nombrePeriodo(p)}
        </option>
      ))}
    </select>
  );
}
