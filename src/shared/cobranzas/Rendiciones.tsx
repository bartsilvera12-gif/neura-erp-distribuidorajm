"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import { HandCoins, Plus, Printer, Truck } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import ModalCaja from "@/shared/caja/ModalCaja";
import MontoInput from "@/components/ui/MontoInput";
import SmartCombobox from "@/components/ui/SmartCombobox";
import { METODOS_COBRO } from "@/lib/ventas/types";
import { useEmisor } from "@/shared/hooks/useEmisor";
import CobranzasTabs from "./CobranzasTabs";

type Resumen = {
  ventas_contado: number;
  cantidad_ventas: number;
  cobros_credito: number;
  cantidad_cobros: number;
  otros_ingresos: number;
  egresos: number;
  ventas_credito: number;
};
type Movimiento = {
  fecha: string;
  tipo: string;
  clase:
    | "venta_contado"
    | "cobro_credito"
    | "otro_ingreso"
    | "egreso"
    | "ajuste";
  concepto: string | null;
  medio: string;
  monto: number;
};
type Calculo = {
  responsable: { id: string; nombre: string };
  tipo: "reparto" | "cobranza";
  camion: { id: string; alias: string } | null;
  desde: string;
  hasta: string;
  por_medio: { medio: string; cobrado: number }[];
  resumen: Resumen;
  cobrado_total: number;
  movimientos: Movimiento[];
  superpuesta: { numero: number; hasta: string } | null;
};
type Rendicion = {
  id: string;
  numero: number;
  tipo: "reparto" | "cobranza";
  responsable_nombre: string;
  camion_alias: string | null;
  desde: string;
  hasta: string;
  cobrado_total: number;
  rendido_total: number;
  diferencia: number;
  observaciones: string | null;
  recibido_por: string | null;
  created_at: string;
  detalle?: {
    por_medio: { medio: string; cobrado: number; rendido: number }[];
    resumen: Resumen;
    movimientos: Movimiento[];
  };
};

const hoy = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(
    new Date(),
  );
const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString("es-PY")}`;
const numero = (n: number) => `REN-${String(n).padStart(6, "0")}`;
const medioLabel = (v: string) =>
  METODOS_COBRO.find((m) => m.value === v)?.label ??
  (v ? v[0].toUpperCase() + v.slice(1) : "Sin registrar");
const CLASE: Record<Movimiento["clase"], string> = {
  venta_contado: "Venta contado",
  cobro_credito: "Cobro de crédito",
  otro_ingreso: "Otro ingreso",
  egreso: "Egreso",
  ajuste: "Ajuste",
};

function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-PY", {
    timeZone: "America/Asuncion",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** ISO → valor de <input type="datetime-local"> en hora de Paraguay. */
function aLocal(iso: string): string {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Asuncion",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
}
/** Valor de datetime-local (hora de Paraguay) → ISO. */
const deLocal = (v: string) =>
  v ? new Date(`${v}:00-03:00`).toISOString() : "";

async function api<T>(
  url: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetchWithSupabaseSession(url, {
    method: init?.method ?? "GET",
    headers:
      init?.body !== undefined
        ? { "Content-Type": "application/json" }
        : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const j = (await res.json().catch(() => ({}))) as {
    data?: T;
    error?: string;
  };
  if (!res.ok) throw new Error(j.error ?? `Error ${res.status}`);
  return j.data as T;
}

const INPUT =
  "h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/30";

/**
 * Cobranzas → Rendiciones (punto 2): la entrega de la plata que cobró cada
 * uno —el chofer de su reparto, un cobrador, un cajero—. El sistema calcula
 * lo cobrado; se carga lo rendido y queda la diferencia, quién recibió y cuándo.
 */
export default function Rendiciones() {
  const [desde, setDesde] = useState(`${hoy().slice(0, 8)}01`);
  const [hasta, setHasta] = useState(hoy());
  const [nueva, setNueva] = useState(false);
  const [verId, setVerId] = useState<string | null>(null);
  const url = `/api/rendiciones?desde=${desde}&hasta=${hasta}`;
  const { data, error, isLoading, mutate } = useSWR<{
    disponible: boolean;
    rendiciones: Rendicion[];
  }>(url, () => api(url), {
    revalidateOnFocus: true,
    keepPreviousData: true,
  });
  const lista = data?.rendiciones ?? [];
  const totales = lista.reduce(
    (a, r) => ({
      cobrado: a.cobrado + r.cobrado_total,
      rendido: a.rendido + r.rendido_total,
      dif: a.dif + r.diferencia,
    }),
    { cobrado: 0, rendido: 0, dif: 0 },
  );

  return (
    <div className="space-y-5 px-4 pb-24 pt-4 sm:px-6 sm:pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Operativo
            </p>
          </div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
            <HandCoins className="h-6 w-6 text-slate-400" />
            Rendiciones
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Lo que cobró cada uno (reparto de los camiones y cobros a clientes)
            contra lo que entregó.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNueva(true)}
          disabled={data ? !data.disponible : false}
          className="flex items-center gap-2 rounded-xl bg-[#4FAEB2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#3f9599] disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          Nueva rendición
        </button>
      </div>

      <CobranzasTabs />

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-slate-500">
          Desde
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => setDesde(e.target.value || desde)}
            className={`${INPUT} mt-1 block`}
          />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Hasta
          <input
            type="date"
            value={hasta}
            min={desde}
            onChange={(e) => setHasta(e.target.value || hasta)}
            className={`${INPUT} mt-1 block`}
          />
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <Total label="Cobrado" valor={totales.cobrado} />
          <Total label="Rendido" valor={totales.rendido} />
          <Total label="Diferencia" valor={totales.dif} signo />
        </div>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {(error as Error).message}
        </p>
      ) : data && !data.disponible ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Falta correr el SQL 54 (rendiciones).
        </p>
      ) : isLoading && !data ? (
        <p className="py-8 text-sm text-slate-400">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          No hay rendiciones en estas fechas. Tocá «Nueva rendición» cuando
          alguien entregue lo cobrado.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full whitespace-nowrap text-sm [&_td]:px-3 [&_th]:px-3">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">N°</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Responsable</th>
                <th className="px-4 py-3">Período</th>
                <th className="px-4 py-3 text-right">Cobrado</th>
                <th className="px-4 py-3 text-right">Rendido</th>
                <th className="px-4 py-3 text-right">Diferencia</th>
                <th className="px-4 py-3">Recibió</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setVerId(r.id)}
                  className="cursor-pointer text-slate-800 hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-mono text-xs font-semibold">
                    {numero(r.numero)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-500">
                    {fechaHora(r.created_at)}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {r.responsable_nombre}
                    <span className="block text-xs font-normal text-slate-400">
                      {r.camion_alias
                        ? `Reparto · ${r.camion_alias}`
                        : "Cobranza"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-slate-500">
                    {fechaHora(r.desde)} →
                    <span className="block">{fechaHora(r.hasta)}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {gs(r.cobrado_total)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {gs(r.rendido_total)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-semibold tabular-nums ${colorDif(r.diferencia)}`}
                  >
                    {gsSigno(r.diferencia)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {r.recibido_por ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nueva ? (
        <NuevaRendicion
          onCerrar={() => setNueva(false)}
          onGuardada={(id) => {
            setNueva(false);
            void mutate();
            setVerId(id);
          }}
        />
      ) : null}
      {verId ? (
        <DetalleRendicion id={verId} onCerrar={() => setVerId(null)} />
      ) : null}
    </div>
  );
}

function colorDif(n: number) {
  return Math.abs(n) < 0.5
    ? "text-emerald-700"
    : n < 0
      ? "text-red-600"
      : "text-amber-600";
}
function gsSigno(n: number) {
  if (Math.abs(n) < 0.5) return "Gs. 0";
  return `${n > 0 ? "+" : "−"}${gs(Math.abs(n))}`;
}

function Total({
  label,
  valor,
  signo,
}: {
  label: string;
  valor: number;
  signo?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-2">
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p
        className={`text-base font-bold tabular-nums ${signo ? colorDif(valor) : "text-slate-900"}`}
      >
        {signo ? gsSigno(valor) : gs(valor)}
      </p>
    </div>
  );
}

function ResumenCobrado({ r }: { r: Resumen }) {
  const filas: [string, number, string?][] = [
    ["Ventas al contado", r.ventas_contado, `${r.cantidad_ventas} ventas`],
    ["Cobros de créditos", r.cobros_credito, `${r.cantidad_cobros} cobros`],
    ["Otros ingresos", r.otros_ingresos],
    ["Egresos y retiros", r.egresos ? -r.egresos : 0],
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {filas.map(([l, v, sub]) => (
        <div key={l} className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold text-slate-500">{l}</p>
          <p
            className={`text-sm font-bold tabular-nums ${v < 0 ? "text-red-600" : "text-slate-900"}`}
          >
            {v < 0 ? `−${gs(-v)}` : gs(v)}
          </p>
          {sub ? <p className="text-[11px] text-slate-400">{sub}</p> : null}
        </div>
      ))}
    </div>
  );
}

function NuevaRendicion({
  onCerrar,
  onGuardada,
}: {
  onCerrar: () => void;
  onGuardada: (id: string) => void;
}) {
  const [usuarios, setUsuarios] = useState<
    { id: string; nombre: string | null; email: string; rol: string | null }[]
  >([]);
  const [responsable, setResponsable] = useState<string | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState(aLocal(new Date().toISOString()));
  const [calc, setCalc] = useState<Calculo | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [rendido, setRendido] = useState<Record<string, number>>({});
  const [obs, setObs] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWithSupabaseSession("/api/usuarios/empresa-activos")
      .then((r) => r.json())
      .then((j: { usuarios?: typeof usuarios }) =>
        setUsuarios(j.usuarios ?? []),
      )
      .catch(() => setUsuarios([]));
  }, []);
  const opciones = useMemo(
    () =>
      usuarios.map((u) => ({
        id: u.id,
        label: (u.nombre || u.email).toUpperCase(),
        sub: u.rol ?? u.email,
      })),
    [usuarios],
  );

  async function calcular(resp: string, d: string, h: string) {
    setCalculando(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ responsable_id: resp });
      if (d) qs.set("desde", deLocal(d));
      if (h) qs.set("hasta", deLocal(h));
      const c = await api<Calculo>(`/api/rendiciones/calcular?${qs}`);
      setCalc(c);
      if (!d) setDesde(aLocal(c.desde));
      // Arranca proponiendo que rindió lo que cobró; se corrige lo que no.
      setRendido(
        Object.fromEntries(
          c.por_medio.map((m) => [m.medio, Math.max(0, Math.round(m.cobrado))]),
        ),
      );
    } catch (e) {
      setCalc(null);
      setError(e instanceof Error ? e.message : "No se pudo calcular.");
    } finally {
      setCalculando(false);
    }
  }

  function elegir(id: string | null) {
    setResponsable(id);
    setDesde("");
    setCalc(null);
    if (id) void calcular(id, "", hasta);
  }

  const rendidoTotal = Object.values(rendido).reduce((s, v) => s + (v || 0), 0);
  const diferencia = rendidoTotal - (calc?.cobrado_total ?? 0);

  async function guardar() {
    if (!calc || !responsable) return setError("Elegí quién rinde.");
    setGuardando(true);
    setError(null);
    try {
      const r = await api<{ id: string }>("/api/rendiciones", {
        method: "POST",
        body: {
          responsable_id: responsable,
          desde: deLocal(desde),
          hasta: deLocal(hasta),
          rendido,
          observaciones: obs,
        },
      });
      onGuardada(r.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ModalCaja
      titulo="Nueva rendición"
      subtitulo="Elegí quién rinde: el sistema suma lo que cobró en sus cajas en ese período."
      onCerrar={onCerrar}
      pie={
        <>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || !calc || !!calc.superpuesta}
            className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3f9599] disabled:opacity-40"
          >
            {guardando ? "Guardando…" : "Registrar rendición"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* div y no label: dentro de un label, el clic en una opción vuelve a abrir el combo. */}
        <div>
          <span className="mb-1 block text-xs font-semibold text-slate-600">
            Quién rinde
          </span>
          <SmartCombobox
            options={opciones}
            value={responsable}
            onChange={elegir}
            allowClear={false}
            placeholder="Buscar repartidor, cobrador o cajero…"
          />
        </div>
        {responsable ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Desde
              </span>
              <input
                type="datetime-local"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                onBlur={() => desde && void calcular(responsable, desde, hasta)}
                className={`${INPUT} w-full`}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Hasta
              </span>
              <input
                type="datetime-local"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                onBlur={() => hasta && void calcular(responsable, desde, hasta)}
                className={`${INPUT} w-full`}
              />
            </label>
          </div>
        ) : null}

        {calculando ? (
          <p className="text-sm text-slate-400">Calculando lo cobrado…</p>
        ) : null}

        {calc ? (
          <>
            {calc.camion ? (
              <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <Truck className="h-4 w-4 text-slate-400" /> Rendición de
                reparto del {calc.camion.alias}
              </p>
            ) : null}
            {calc.superpuesta ? (
              <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
                Este período se pisa con la rendición{" "}
                {numero(calc.superpuesta.numero)}, que llega hasta el{" "}
                {fechaHora(calc.superpuesta.hasta)}. Poné «Desde» después de esa
                hora.
              </p>
            ) : null}
            <ResumenCobrado r={calc.resumen} />
            {calc.resumen.ventas_credito > 0 ? (
              <p className="text-xs text-slate-500">
                Además vendió a crédito {gs(calc.resumen.ventas_credito)}: no es
                plata que tenga que rendir hoy.
              </p>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Forma de pago</th>
                    <th className="px-3 py-2 text-right">Cobrado</th>
                    <th className="w-40 px-3 py-2 text-right">Rendido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {calc.por_medio.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-3 py-4 text-center text-slate-400"
                      >
                        No cobró nada en este período.
                      </td>
                    </tr>
                  ) : (
                    calc.por_medio.map((m) => (
                      <tr key={m.medio}>
                        <td className="px-3 py-2 font-medium text-slate-800">
                          {medioLabel(m.medio)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {gs(m.cobrado)}
                        </td>
                        <td className="px-3 py-1.5">
                          <MontoInput
                            value={rendido[m.medio] ?? 0}
                            onChange={(n) =>
                              setRendido((p) => ({ ...p, [m.medio]: n }))
                            }
                            decimals={false}
                            aria-label={`Rendido en ${medioLabel(m.medio)}`}
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm tabular-nums"
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="border-t border-slate-200 font-semibold">
                  <tr>
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {gs(calc.cobrado_total)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {gs(rendidoTotal)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2" colSpan={2}>
                      Diferencia{" "}
                      {diferencia < -0.5
                        ? "(falta)"
                        : diferencia > 0.5
                          ? "(sobra)"
                          : ""}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${colorDif(diferencia)}`}
                    >
                      {gsSigno(diferencia)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">
                Observaciones
              </span>
              <input
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder={
                  Math.abs(diferencia) > 0.5 ? "Explicá la diferencia" : ""
                }
                className={`${INPUT} w-full`}
              />
            </label>
          </>
        ) : null}
        {error ? (
          <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </ModalCaja>
  );
}

function DetalleRendicion({
  id,
  onCerrar,
}: {
  id: string;
  onCerrar: () => void;
}) {
  const { data: r, error } = useSWR<Rendicion>(
    `/api/rendiciones/${id}`,
    (u: string) => api<Rendicion>(u),
  );
  const [conMovimientos, setConMovimientos] = useState(false);
  return (
    <>
      {r ? <TicketRendicion r={r} conMovimientos={conMovimientos} /> : null}
      <ModalCaja
        titulo={r ? `Rendición ${numero(r.numero)}` : "Rendición"}
        subtitulo={
          r
            ? `${r.responsable_nombre}${r.camion_alias ? ` · reparto ${r.camion_alias}` : " · cobranza"}`
            : undefined
        }
        onCerrar={onCerrar}
        pie={
          <>
            <label className="mr-auto flex items-center gap-1.5 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={conMovimientos}
                onChange={(e) => setConMovimientos(e.target.checked)}
              />
              Ticket con movimientos
            </label>
            <button
              type="button"
              onClick={onCerrar}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!r}
              className="flex items-center gap-2 rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3f9599] disabled:opacity-40"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
          </>
        }
      >
        {error ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {(error as Error).message}
          </p>
        ) : !r ? (
          <p className="py-6 text-sm text-slate-400">Cargando…</p>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="hidden">
              <p className="text-lg font-bold">Rendición {numero(r.numero)}</p>
              <p>
                {r.responsable_nombre}
                {r.camion_alias
                  ? ` · reparto ${r.camion_alias}`
                  : " · cobranza"}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <Dato
                t="Período"
                v={`${fechaHora(r.desde)} → ${fechaHora(r.hasta)}`}
              />
              <Dato t="Registrada" v={fechaHora(r.created_at)} />
              <Dato t="Recibió" v={r.recibido_por ?? "—"} />
              <Dato t="Observaciones" v={r.observaciones ?? "—"} />
            </dl>
            {r.detalle?.resumen ? (
              <ResumenCobrado r={r.detalle.resumen} />
            ) : null}
            <table className="w-full whitespace-nowrap rounded-xl border border-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Forma de pago</th>
                  <th className="px-3 py-2 text-right">Cobrado</th>
                  <th className="px-3 py-2 text-right">Rendido</th>
                  <th className="px-3 py-2 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(r.detalle?.por_medio ?? []).map((m) => (
                  <tr key={m.medio}>
                    <td className="px-3 py-2">{medioLabel(m.medio)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {gs(m.cobrado)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {gs(m.rendido)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${colorDif(m.rendido - m.cobrado)}`}
                    >
                      {gsSigno(m.rendido - m.cobrado)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 font-semibold">
                <tr>
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {gs(r.cobrado_total)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {gs(r.rendido_total)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${colorDif(r.diferencia)}`}
                  >
                    {gsSigno(r.diferencia)}
                  </td>
                </tr>
              </tfoot>
            </table>
            {(r.detalle?.movimientos.length ?? 0) > 0 ? (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Movimientos
                </p>
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {r.detalle!.movimientos.map((m, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 px-3 py-1.5 text-xs"
                    >
                      <span className="w-28 shrink-0 tabular-nums text-slate-400">
                        {fechaHora(m.fecha)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-slate-700">
                        {CLASE[m.clase]}
                        {m.concepto ? ` · ${m.concepto}` : ""}
                      </span>
                      <span className="shrink-0 text-slate-400">
                        {medioLabel(m.medio)}
                      </span>
                      <span
                        className={`w-24 shrink-0 text-right tabular-nums ${m.monto < 0 ? "text-red-600" : "text-slate-800"}`}
                      >
                        {m.monto < 0 ? `−${gs(-m.monto)}` : gs(m.monto)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="hidden pt-10 print:flex print:justify-between">
              <p className="w-56 border-t border-black pt-1 text-center text-xs">
                Entregó: {r.responsable_nombre}
              </p>
              <p className="w-56 border-t border-black pt-1 text-center text-xs">
                Recibió
              </p>
            </div>
          </div>
        )}
      </ModalCaja>
    </>
  );
}

const CLAVE_ANCHO = "caja:ticket-ancho";
const CLASE_CORTA: Record<Movimiento["clase"], string> = {
  venta_contado: "Venta",
  cobro_credito: "Cobro",
  otro_ingreso: "Ingreso",
  egreso: "Egreso",
  ajuste: "Ajuste",
};

/**
 * La rendición en ticket térmico (80 o 58 mm, el mismo ancho que la caja),
 * cortado al largo justo. Va por portal al <body> con `modal-comprobante`:
 * al imprimir queda solo esto en el papel, sin el modal ni su scroll (que
 * cortaba la lista de movimientos).
 */
function TicketRendicion({
  r,
  conMovimientos,
}: {
  r: Rendicion;
  conMovimientos: boolean;
}) {
  const { emisor } = useEmisor();
  const [ancho] = useState<80 | 58>(() => {
    try {
      return localStorage.getItem(CLAVE_ANCHO) === "58" ? 58 : 80;
    } catch {
      return 80;
    }
  });
  const ref = useRef<HTMLElement>(null);
  const [largoMm, setLargoMm] = useState(200);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setLargoMm(Math.ceil(el.offsetHeight / 3.7795) + 4);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [conMovimientos]);
  if (typeof document === "undefined") return null;
  const res = r.detalle?.resumen;
  const miles = (n: number) => Math.round(n).toLocaleString("es-PY");
  const fila = (a: string, b: string, fuerte = false) => (
    <div className={`flex justify-between gap-2 ${fuerte ? "font-bold" : ""}`}>
      <span>{a}</span>
      <span className="text-right tabular-nums">{b}</span>
    </div>
  );
  const linea = <div className="my-1.5 border-t border-dashed border-black" />;
  const dif = (n: number) =>
    Math.abs(n) < 0.5 ? "0" : `${n > 0 ? "+" : "-"}${miles(Math.abs(n))}`;

  return createPortal(
    <div
      // Fuera de la pantalla pero armado (no `hidden`): así se puede medir el
      // largo del ticket para cortar el papel. Al imprimir, globals.css lo pone en su lugar.
      aria-hidden
      className="modal-comprobante pointer-events-none fixed -left-[9999px] top-0 print:pointer-events-auto"
    >
      <style>{`@media print { @page { size: ${ancho}mm ${largoMm}mm; margin: 0; } }`}</style>
      <article
        ref={ref}
        className="ticket-termico factura-imprimible bg-white font-mono text-black"
        style={{
          width: `${ancho}mm`,
          fontSize: ancho === 58 ? "10px" : "11.5px",
          lineHeight: 1.35,
        }}
      >
        <div style={{ padding: "1.5mm 3mm 3mm" }}>
          <div className="text-center">
            <p className="font-bold uppercase">
              {emisor?.razon_social ??
                emisor?.nombre_fantasia ??
                "Distribuidora JM"}
            </p>
            {emisor?.ruc ? <p>RUC: {emisor.ruc}</p> : null}
            {linea}
            <p className="font-bold">RENDICIÓN {numero(r.numero)}</p>
            <p>{r.camion_alias ? `Reparto ${r.camion_alias}` : "Cobranza"}</p>
          </div>
          {linea}
          {fila("Rinde:", r.responsable_nombre)}
          {fila("Desde:", fechaHora(r.desde))}
          {fila("Hasta:", fechaHora(r.hasta))}
          {fila("Registrada:", fechaHora(r.created_at))}
          {res ? (
            <>
              {linea}
              {fila(
                `Ventas contado (${res.cantidad_ventas})`,
                miles(res.ventas_contado),
              )}
              {fila(
                `Cobros créditos (${res.cantidad_cobros})`,
                miles(res.cobros_credito),
              )}
              {res.otros_ingresos
                ? fila("Otros ingresos", miles(res.otros_ingresos))
                : null}
              {res.egresos ? fila("Egresos", `-${miles(res.egresos)}`) : null}
            </>
          ) : null}
          {linea}
          <div className="flex justify-between gap-2 font-bold">
            <span className="flex-1">Forma</span>
            <span className="w-[22%] text-right">Cobr.</span>
            <span className="w-[22%] text-right">Rend.</span>
            <span className="w-[18%] text-right">Dif.</span>
          </div>
          {(r.detalle?.por_medio ?? []).map((m) => (
            <div key={m.medio} className="flex justify-between gap-2">
              <span className="flex-1 truncate">{medioLabel(m.medio)}</span>
              <span className="w-[22%] text-right tabular-nums">
                {miles(m.cobrado)}
              </span>
              <span className="w-[22%] text-right tabular-nums">
                {miles(m.rendido)}
              </span>
              <span className="w-[18%] text-right tabular-nums">
                {dif(m.rendido - m.cobrado)}
              </span>
            </div>
          ))}
          <div className="my-1 border-t border-black" />
          {fila("COBRADO", `Gs. ${miles(r.cobrado_total)}`, true)}
          {fila("RENDIDO", `Gs. ${miles(r.rendido_total)}`, true)}
          {fila(
            Math.abs(r.diferencia) < 0.5
              ? "DIFERENCIA"
              : r.diferencia < 0
                ? "FALTA"
                : "SOBRA",
            `Gs. ${miles(Math.abs(r.diferencia))}`,
            true,
          )}
          {r.observaciones ? (
            <>
              {linea}
              <p>Obs.: {r.observaciones}</p>
            </>
          ) : null}
          {conMovimientos && (r.detalle?.movimientos.length ?? 0) > 0 ? (
            <>
              {linea}
              <p className="font-bold">Movimientos</p>
              {r.detalle!.movimientos.map((m, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="truncate">
                    {new Date(m.fecha).toLocaleTimeString("es-PY", {
                      timeZone: "America/Asuncion",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}{" "}
                    {CLASE_CORTA[m.clase]}{" "}
                    {(m.concepto ?? "").replace(/^(Venta|Cobro)\s+/, "")}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {m.monto < 0 ? "-" : ""}
                    {miles(Math.abs(m.monto))}
                  </span>
                </div>
              ))}
            </>
          ) : null}
          {linea}
          <div className="mt-8 grid grid-cols-2 gap-3 text-center">
            <div>
              <div className="border-t border-black" />
              <p className="mt-0.5">Entregó</p>
            </div>
            <div>
              <div className="border-t border-black" />
              <p className="mt-0.5">Recibió</p>
            </div>
          </div>
          {r.recibido_por ? (
            <p className="mt-1 text-center">{r.recibido_por}</p>
          ) : null}
        </div>
      </article>
    </div>,
    document.body,
  );
}

function Dato({ t, v }: { t: string; v: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">
        {t}
      </dt>
      <dd className="text-slate-800">{v}</dd>
    </div>
  );
}
