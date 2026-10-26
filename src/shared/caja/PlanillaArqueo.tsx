"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { CheckCircle2, Plus, Printer, RotateCcw, Send, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import MontoInput from "@/components/ui/MontoInput";
import ConteoEfectivoTabla from "@/shared/caja/ConteoEfectivo";
import { useEmisor } from "@/shared/hooks/useEmisor";
import { totalConteo } from "@/lib/cajas/conteo";
import {
  totalesPlanilla,
  type DatosPlanilla,
  type PlanillaArqueo as Sistema,
  type PlanillaGuardada,
  type RenglonPlanilla,
} from "@/lib/cajas/planilla";

type Respuesta = {
  disponible: boolean;
  es_admin: boolean;
  sistema: Sistema;
  guardada: PlanillaGuardada | null;
  datos: DatosPlanilla;
};

const gs = (v: number) => `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
function fecha(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-PY", { timeZone: "America/Asuncion", day: "2-digit", month: "2-digit", year: "numeric" });
}
const ESTADO: Record<string, { texto: string; clase: string }> = {
  borrador: { texto: "Sin enviar", clase: "bg-slate-100 text-slate-600" },
  enviada: { texto: "Enviada al administrador", clase: "bg-sky-50 text-sky-700" },
  revisada: { texto: "Revisada", clase: "bg-emerald-50 text-emerald-700" },
};
const INPUT =
  "h-8 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2] disabled:bg-slate-50";

/**
 * Planilla de arqueo de caja, como la hoja de papel de los camioneros pero
 * en el sistema: viene completada con lo que el sistema ya sabe (contado,
 * crédito, cobranzas, transferencias, gastos) y el camionero la corrige,
 * cuenta los billetes y la envía. El administrador la ve en Cobranzas →
 * Planillas de arqueo.
 */
export default function PlanillaArqueo({
  cajaId,
  onCerrar,
  onGuardada,
  inline = false,
}: {
  cajaId: string;
  /** Sin `onCerrar` no hay botón de cerrar (la planilla está en la página). */
  onCerrar?: () => void;
  onGuardada?: () => void;
  /** En la página de Arqueo, sin ventana encima. */
  inline?: boolean;
}) {
  const url = `/api/cajas/${cajaId}/planilla`;
  const { data, error, mutate } = useSWR<Respuesta>(url, async () => {
    const res = await fetchWithSupabaseSession(url, { cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as { data?: Respuesta; error?: string };
    if (!res.ok || !j.data) throw new Error(j.error ?? "No se pudo abrir la planilla.");
    return j.data;
  });

  useEffect(() => {
    if (inline) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [inline]);

  const contenido = error ? (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <p className="text-sm text-red-700">{(error as Error).message}</p>
      {onCerrar ? (
        <button type="button" onClick={onCerrar} className="mt-4 rounded-lg border px-4 py-2 text-sm">
          Cerrar
        </button>
      ) : null}
    </div>
  ) : !data ? (
    <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Abriendo la planilla…</p>
  ) : (
    <Formulario
      // Sin guardar todavía, sigue a lo que el sistema va sumando (ventas,
      // cobranzas, gastos); ya guardada, manda lo que se cargó.
      key={
        data.guardada?.updated_at ??
        `s-${data.sistema.contado}-${data.sistema.credito.length}-${data.sistema.cobranzas.length}-${data.sistema.gastos.length}-${data.sistema.transferencias.length}`
      }
      r={data}
      url={url}
      onCerrar={onCerrar}
      onGuardada={() => {
        void mutate();
        onGuardada?.();
      }}
    />
  );

  if (inline) return contenido;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-modal="true" className="modal-comprobante fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 p-3 sm:p-6">
      <div className="mx-auto w-full max-w-6xl">{contenido}</div>
    </div>,
    document.body
  );
}

function Formulario({
  r,
  url,
  onCerrar,
  onGuardada,
}: {
  r: Respuesta;
  url: string;
  onCerrar?: () => void;
  onGuardada: () => void;
}) {
  const { emisor } = useEmisor();
  const [d, setD] = useState<DatosPlanilla>(r.datos);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const estado = r.guardada?.estado ?? "borrador";
  const soloLectura = estado === "revisada" && !r.es_admin;
  const s = r.sistema;

  const efectivo = totalConteo(d.conteo);
  const t = totalesPlanilla(d, efectivo);
  const cambiar = (patch: Partial<DatosPlanilla>) => setD((x) => ({ ...x, ...patch }));

  async function guardar(enviar: boolean) {
    if (enviar && !window.confirm("¿Enviar la planilla al administrador?")) return;
    setGuardando(true);
    setAviso(null);
    try {
      const res = await fetchWithSupabaseSession(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datos: d, enviar }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "No se pudo guardar la planilla.");
      setAviso({ ok: true, texto: enviar ? "Planilla enviada al administrador." : "Planilla guardada." });
      onGuardada();
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : "No se pudo guardar la planilla." });
    } finally {
      setGuardando(false);
    }
  }

  async function revisar(revisada: boolean) {
    if (!r.guardada) return;
    setGuardando(true);
    const res = await fetchWithSupabaseSession(`/api/planillas-arqueo/${r.guardada.id}/revisar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revisada }),
    });
    setGuardando(false);
    if (!res.ok) setAviso({ ok: false, texto: "No se pudo marcar la planilla." });
    else onGuardada();
  }

  function traerDelSistema() {
    if (!window.confirm("¿Volver a traer las ventas, cobranzas y movimientos del sistema? Lo que cambiaste a mano en esas listas se pierde (el conteo de billetes se queda).")) return;
    setD((x) => ({
      ...x,
      apertura: s.caja.monto_apertura + s.caja.sencillo,
      contado: s.contado,
      cheques: s.cheques,
      credito: s.credito,
      cobranzas: s.cobranzas,
      gastos: s.gastos,
      transferencias: s.transferencias,
    }));
  }

  return (
    <div className="factura-imprimible rounded-2xl border border-slate-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Arqueo de caja</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {fecha(s.caja.fecha_apertura)} · Caja {s.caja.numero_caja}
            {s.responsable ? ` · ${s.responsable}` : ""}
            {s.camion ? ` · Camión ${s.camion}` : ""}
          </p>
          <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTADO[estado].clase}`}>
            {ESTADO[estado].texto}
            {estado === "revisada" && r.guardada?.revisada_por ? ` por ${r.guardada.revisada_por}` : ""}
          </span>
        </div>
        <div className="no-imprimir flex flex-wrap gap-2">
          {!soloLectura ? (
            <button type="button" onClick={traerDelSistema}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              <RotateCcw className="h-3.5 w-3.5" /> Traer del sistema
            </button>
          ) : null}
          <button type="button" onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </button>
          {onCerrar ? (
            <button type="button" onClick={onCerrar} aria-label="Cerrar"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {!r.disponible ? (
        <p className="mx-5 mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Falta correr el SQL 58 (planillas de arqueo): se puede completar, pero todavía no se puede guardar.
        </p>
      ) : null}

      <div className="space-y-5 p-5">
        {/* Totales de arriba */}
        <div className="grid gap-3 sm:grid-cols-3">
          <CampoMonto etiqueta="Total s/ factura contado" valor={d.contado} onCambio={(v) => cambiar({ contado: v })} disabled={soloLectura}
            ayuda={`Según el sistema: ${gs(s.contado)}`} />
          <CampoMonto etiqueta="Apertura / sencillo" valor={d.apertura} onCambio={(v) => cambiar({ apertura: v })} disabled={soloLectura}
            ayuda="Con lo que arrancó la caja" />
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total de ventas</p>
            <p className="text-xl font-bold tabular-nums text-slate-900">{gs(t.ventas)}</p>
            <p className="text-[11px] text-slate-500">Contado {gs(d.contado)} + crédito {gs(t.credito)}</p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Composición de caja */}
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-800">Composición de caja</p>
            <ConteoEfectivoTabla conteo={d.conteo} onChange={(c) => cambiar({ conteo: c })} soloLectura={soloLectura} />
            <div className="mt-2">
              <CampoMonto etiqueta="Cheques" valor={d.cheques} onCambio={(v) => cambiar({ cheques: v })} disabled={soloLectura} />
            </div>
          </div>

          <div className="space-y-4">
            {/* La cuenta */}
            <div className="rounded-xl border-2 border-slate-200 p-4">
              <p className="mb-2 text-sm font-semibold text-slate-800">Cuenta de la caja</p>
              <Linea texto="Apertura / sencillo" valor={d.apertura} />
              <Linea texto="Contado" valor={d.contado} />
              <Linea texto="Cobranza crédito" valor={t.cobranzas} />
              <Linea texto="Debe rendir" valor={t.debe} fuerte />
              <div className="my-2 border-t border-slate-100" />
              <Linea texto="Efectivo contado" valor={efectivo} />
              {d.cheques ? <Linea texto="Cheques" valor={d.cheques} /> : null}
              <Linea texto="Gastos, vales y otros" valor={t.gastos} />
              <Linea texto="Transferencias" valor={t.transferencias} />
              <Linea texto="Rinde" valor={t.rinde} fuerte />
              <div
                className={`mt-2 flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold ${
                  Math.round(t.diferencia) === 0
                    ? "bg-emerald-50 text-emerald-700"
                    : t.diferencia < 0
                      ? "bg-red-50 text-red-700"
                      : "bg-amber-50 text-amber-700"
                }`}
              >
                <span>{Math.round(t.diferencia) === 0 ? "Cuadra" : t.diferencia < 0 ? "Falta" : "Sobra"}</span>
                <span className="tabular-nums">{gs(Math.abs(t.diferencia))}</span>
              </div>
            </div>

            {/* Datos para transferencias */}
            <div className="rounded-xl border border-slate-200 p-4 text-sm">
              <p className="font-semibold text-slate-800">Datos para transferencias</p>
              {emisor?.razon_social ? <p className="text-xs text-slate-500">{emisor.razon_social}</p> : null}
              {s.cuentas.length === 0 ? (
                <p className="mt-1 text-xs text-slate-400">Se cargan en Bancos (cuenta propia).</p>
              ) : (
                <ul className="mt-1.5 space-y-1 text-xs text-slate-700">
                  {s.cuentas.map((k, i) => (
                    <li key={i}>
                      <b>{k.banco}</b>
                      {k.alias ? ` · Alias: ${k.alias}` : ""}
                      {k.cuenta ? ` · Cta. ${k.cuenta}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <ListaEditable titulo="Detalle de factura crédito" filas={d.credito} conFactura disabled={soloLectura}
            onCambio={(f) => cambiar({ credito: f })} placeholder="Cliente" />
          <ListaEditable titulo="Cobranza crédito" filas={d.cobranzas} conFactura disabled={soloLectura}
            onCambio={(f) => cambiar({ cobranzas: f })} placeholder="Cliente" />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <ListaEditable titulo="Resumen gastos - vale y otros" filas={d.gastos} disabled={soloLectura}
            onCambio={(f) => cambiar({ gastos: f })} placeholder="Concepto (salón efectivo, retención, descuento…)" />
          <ListaEditable titulo="Transferencias" filas={d.transferencias} disabled={soloLectura}
            onCambio={(f) => cambiar({ transferencias: f })} placeholder="Cliente" />
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-800">Observaciones</span>
          <textarea
            value={d.observaciones}
            onChange={(e) => cambiar({ observaciones: e.target.value })}
            disabled={soloLectura}
            rows={2}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2] disabled:bg-slate-50"
          />
        </label>
      </div>

      <div className="no-imprimir flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
        {aviso ? (
          <p className={`mr-auto text-sm ${aviso.ok ? "text-emerald-700" : "text-red-700"}`}>{aviso.texto}</p>
        ) : null}
        {onCerrar ? (
          <button type="button" onClick={onCerrar} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
            Cerrar
          </button>
        ) : null}
        {soloLectura || !r.disponible ? null : (
          <>
            <button type="button" onClick={() => void guardar(false)} disabled={guardando}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {guardando ? "Guardando…" : r.es_admin && estado !== "borrador" ? "Guardar cambios" : "Guardar sin enviar"}
            </button>
            {estado === "revisada" ? null : (
              <button type="button" onClick={() => void guardar(true)} disabled={guardando}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50">
                <Send className="h-4 w-4" />
                {estado === "enviada" ? "Volver a enviar" : "Enviar al administrador"}
              </button>
            )}
          </>
        )}
        {r.es_admin && r.guardada ? (
          estado === "revisada" ? (
            <button type="button" onClick={() => void revisar(false)} disabled={guardando}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Reabrir
            </button>
          ) : (
            <button type="button" onClick={() => void revisar(true)} disabled={guardando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Marcar revisada
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}

function CampoMonto({
  etiqueta,
  valor,
  onCambio,
  disabled,
  ayuda,
}: {
  etiqueta: string;
  valor: number;
  onCambio: (v: number) => void;
  disabled?: boolean;
  ayuda?: string;
}) {
  return (
    <label className="block rounded-xl border border-slate-200 px-4 py-2.5">
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{etiqueta}</span>
      <MontoInput
        value={valor}
        onChange={onCambio}
        decimals={false}
        disabled={disabled}
        className="mt-0.5 w-full border-0 p-0 text-xl font-bold tabular-nums text-slate-900 outline-none disabled:bg-transparent"
      />
      {ayuda ? <span className="block text-[11px] text-slate-400">{ayuda}</span> : null}
    </label>
  );
}

function Linea({ texto, valor, fuerte = false }: { texto: string; valor: number; fuerte?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-0.5 text-sm ${fuerte ? "font-bold text-slate-900" : "text-slate-600"}`}>
      <span>{texto}</span>
      <span className="tabular-nums">{gs(valor)}</span>
    </div>
  );
}

/** Lista que se completa a mano: nombre, N° de factura (si va) e importe. */
function ListaEditable({
  titulo,
  filas,
  onCambio,
  conFactura = false,
  disabled,
  placeholder,
}: {
  titulo: string;
  filas: RenglonPlanilla[];
  onCambio: (f: RenglonPlanilla[]) => void;
  conFactura?: boolean;
  disabled?: boolean;
  placeholder: string;
}) {
  const total = filas.reduce((s, f) => s + (Number(f.monto) || 0), 0);
  const set = (i: number, patch: Partial<RenglonPlanilla>) => onCambio(filas.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="flex items-center justify-between bg-slate-50 px-3 py-2">
        <p className="text-sm font-semibold text-slate-800">{titulo}</p>
        <p className="text-sm font-bold tabular-nums text-slate-900">{gs(total)}</p>
      </div>
      <div className="divide-y divide-slate-100">
        {filas.length === 0 ? <p className="px-3 py-3 text-xs text-slate-400">Sin renglones.</p> : null}
        {filas.map((f, i) => (
          <div
            key={i}
            className={`grid items-center gap-1.5 px-2 py-1.5 ${
              conFactura ? "grid-cols-[20px_minmax(0,1fr)_72px_120px_28px]" : "grid-cols-[20px_minmax(0,1fr)_120px_28px]"
            }`}
          >
            <span className="text-right text-xs text-slate-400">{i + 1}</span>
            <input value={f.nombre} onChange={(e) => set(i, { nombre: e.target.value })} disabled={disabled}
              placeholder={placeholder} aria-label={`${titulo}: nombre ${i + 1}`} className={`${INPUT} w-full`} />
            {conFactura ? (
              <input value={f.factura ?? ""} onChange={(e) => set(i, { factura: e.target.value })} disabled={disabled}
                placeholder="Fac" aria-label={`${titulo}: factura ${i + 1}`} className={`${INPUT} w-full text-center`} />
            ) : null}
            <MontoInput value={f.monto} onChange={(v) => set(i, { monto: v })} decimals={false} disabled={disabled}
              aria-label={`${titulo}: importe ${i + 1}`} className={`${INPUT} w-full text-right tabular-nums`} />
            {disabled ? null : (
              <button type="button" onClick={() => onCambio(filas.filter((_, j) => j !== i))} aria-label="Quitar renglón"
                className="no-imprimir shrink-0 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      {disabled ? null : (
        <button type="button" onClick={() => onCambio([...filas, { nombre: "", factura: null, monto: 0 }])}
          className="no-imprimir flex w-full items-center justify-center gap-1 border-t border-slate-100 py-2 text-xs font-semibold text-[#3F8E91] hover:bg-slate-50">
          <Plus className="h-3.5 w-3.5" /> Agregar renglón
        </button>
      )}
    </div>
  );
}
