"use client";

import { useMemo, useState } from "react";
import { HandCoins, Phone, RefreshCw, Search } from "lucide-react";
import { useCobranzaCredito } from "@/shared/hooks/useCobranzaCredito";
import {
  cobrarVenta,
  type ClienteCobranzaCredito,
  type VentaCobranza,
} from "@/lib/cobranzas/credito";
import { METODOS_PAGO } from "@/lib/ventas/types";

const TEAL = "#4FAEB2";

function gs(v: number): string {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}

function hoyEnAsuncion(): string {
  return new Intl.DateTimeFormat("es-PY", {
    timeZone: "America/Asuncion",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

// ── Tramos de mora ────────────────────────────────────────────────────────────

type TramoKey = "por_vencer" | "tramo_1" | "tramo_2" | "tramo_3";

/**
 * Tramo por días de atraso, no por cantidad de cuotas: acá no hay cuotas, hay
 * una venta fiada que se cobra en la próxima vuelta. Los cortes son los de la
 * ruta: lo de esta semana, lo del mes, y lo que ya hay que ir a reclamar.
 */
function tramoDeDias(dias: number): TramoKey {
  if (dias < 0) return "por_vencer";
  if (dias <= 7) return "tramo_1";
  if (dias <= 30) return "tramo_2";
  return "tramo_3";
}

const TRAMO_LABEL: Record<TramoKey, string> = {
  por_vencer: "Por vencer",
  tramo_1: "Tramo 1",
  tramo_2: "Tramo 2",
  tramo_3: "Tramo 3",
};

const TRAMO_AYUDA: Record<TramoKey, string> = {
  por_vencer: "Todavía no vence",
  tramo_1: "Vencida hace 7 días o menos",
  tramo_2: "Vencida hace 8 a 30 días",
  tramo_3: "Vencida hace más de 30 días",
};

const TRAMO_CLASS: Record<TramoKey, string> = {
  por_vencer: "border-sky-200 bg-sky-50 text-sky-700",
  tramo_1: "border-amber-200 bg-amber-50 text-amber-700",
  tramo_2: "border-orange-200 bg-orange-50 text-orange-700",
  tramo_3: "border-rose-200 bg-rose-50 text-rose-700",
};

const TRAMO_PESO: Record<TramoKey, number> = {
  por_vencer: 0,
  tramo_1: 1,
  tramo_2: 2,
  tramo_3: 3,
};

/** El cliente se clasifica por su peor venta: es la que hay que ir a cobrar. */
function peorTramo(ventas: VentaCobranza[]): TramoKey {
  let peor: TramoKey = "por_vencer";
  for (const v of ventas) {
    const t = tramoDeDias(v.dias_vencida);
    if (TRAMO_PESO[t] > TRAMO_PESO[peor]) peor = t;
  }
  return peor;
}

/** "Vencida hace 12 días" / "Vence hoy" / "Vence en 3 días". */
function estadoVencimiento(dias: number): { texto: string; vencida: boolean } {
  if (dias > 0) return { texto: `Vencida hace ${dias} ${dias === 1 ? "día" : "días"}`, vencida: true };
  if (dias === 0) return { texto: "Vence hoy", vencida: true };
  const faltan = -dias;
  return { texto: `Vence en ${faltan} ${faltan === 1 ? "día" : "días"}`, vencida: false };
}

// ── KPI ───────────────────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  accent,
  onClick,
  active,
}: {
  label: string;
  value: string | number;
  accent?: "featured" | "danger" | "warning";
  onClick?: () => void;
  active?: boolean;
}) {
  const valueCls =
    accent === "featured"
      ? "text-[#3F8E91]"
      : accent === "danger"
        ? "text-rose-700"
        : accent === "warning"
          ? "text-amber-700"
          : "text-slate-900";
  const clickable = typeof onClick === "function";
  return (
    <div
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`rounded-2xl border bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${
        clickable
          ? "cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/30"
          : ""
      } ${active ? "border-[#4FAEB2] ring-2 ring-[#4FAEB2]/30" : "border-slate-200"}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
        {clickable ? (
          <span className="ml-1 text-[#4FAEB2]">{active ? "· filtrando" : "· filtrar"}</span>
        ) : null}
      </p>
      <p
        className={`mt-1.5 whitespace-nowrap text-lg font-semibold tabular-nums tracking-tight sm:text-2xl ${valueCls}`}
      >
        {value}
      </p>
    </div>
  );
}

function TramoBadge({ tramo }: { tramo: TramoKey }) {
  return (
    <span
      title={TRAMO_AYUDA[tramo]}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TRAMO_CLASS[tramo]}`}
    >
      {TRAMO_LABEL[tramo]}
    </span>
  );
}

// ── Pantalla ──────────────────────────────────────────────────────────────────

/**
 * Seguimiento de cobranzas de las ventas a crédito.
 *
 * Lo que se cobra en la ruta es la venta fiada, no una factura de suscripción:
 * la deuda es el total de la venta menos lo que se le fue cobrando, sin una
 * tabla intermedia que pueda quedar desfasada.
 *
 * Arriba, los números del día y los tramos de mora, para saber por dónde
 * arrancar la vuelta. Abajo, cada cliente con sus ventas y el botón de cobrar.
 *
 * El cobro entra como ingreso de caja imputado a esa venta, así que aparece
 * solo en el arqueo del día. El vendedor no carga nada dos veces.
 */
export default function CobranzasCredito() {
  const { cobranza, isLoading, mutate } = useCobranzaCredito();
  const [cobrando, setCobrando] = useState<VentaCobranza | null>(null);
  const [tramoFiltro, setTramoFiltro] = useState<TramoKey | "todos">("todos");
  const [soloVencido, setSoloVencido] = useState(false);
  const [query, setQuery] = useState("");

  const clientes = useMemo(() => cobranza?.clientes ?? [], [cobranza?.clientes]);

  /** Cada cliente con su tramo ya resuelto: se usa para contar y para filtrar. */
  const conTramo = useMemo(
    () => clientes.map((c) => ({ cliente: c, tramo: peorTramo(c.ventas) })),
    [clientes]
  );

  const contadoPorTramo = useMemo(() => {
    const n: Record<TramoKey, number> = { por_vencer: 0, tramo_1: 0, tramo_2: 0, tramo_3: 0 };
    for (const { tramo } of conTramo) n[tramo] += 1;
    return n;
  }, [conTramo]);

  const ventasVencidas = useMemo(
    () => clientes.reduce((s, c) => s + c.ventas.filter((v) => v.dias_vencida >= 0).length, 0),
    [clientes]
  );

  const filtrados = useMemo(() => {
    const t = query.trim().toLowerCase();
    return conTramo
      .filter(({ tramo }) => tramoFiltro === "todos" || tramo === tramoFiltro)
      .filter(({ cliente }) => !soloVencido || cliente.vencido > 0)
      .filter(({ cliente }) => {
        if (t === "") return true;
        return (
          cliente.cliente.toLowerCase().includes(t) ||
          (cliente.telefono ?? "").toLowerCase().includes(t) ||
          cliente.ventas.some((v) => v.numero_control.toLowerCase().includes(t))
        );
      });
  }, [conTramo, tramoFiltro, soloVencido, query]);

  const chips: { key: TramoKey | "todos"; label: string; count: number }[] = [
    { key: "todos", label: "Todos", count: conTramo.length },
    { key: "tramo_3", label: "Tramo 3", count: contadoPorTramo.tramo_3 },
    { key: "tramo_2", label: "Tramo 2", count: contadoPorTramo.tramo_2 },
    { key: "tramo_1", label: "Tramo 1", count: contadoPorTramo.tramo_1 },
    { key: "por_vencer", label: "Por vencer", count: contadoPorTramo.por_vencer },
  ];

  const resumen = cobranza?.resumen ?? { total: 0, vencido: 0, clientes: 0, ventas: 0 };
  const hayFiltro = tramoFiltro !== "todos" || soloVencido || query.trim() !== "";

  return (
    <div className="space-y-6 pb-24 sm:pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
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
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Seguimiento de cobranzas
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Ventas a crédito con saldo y tramos de mora
            {cobranza?.alcance === "propias" ? ", de tus repartos" : ""} · al {hoyEnAsuncion()}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => mutate()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:border-[#4FAEB2]/60 hover:text-[#3F8E91]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total adeudado" value={gs(resumen.total)} accent="danger" />
        <Kpi label="Clientes con deuda" value={resumen.clientes} accent="featured" />
        <Kpi label="Ventas vencidas" value={ventasVencidas} />
        <Kpi
          label="Monto vencido"
          value={gs(resumen.vencido)}
          accent={resumen.vencido > 0 ? "danger" : undefined}
          onClick={() => setSoloVencido((v) => !v)}
          active={soloVencido}
        />
      </div>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Kpi label="Por vencer" value={contadoPorTramo.por_vencer} />
        <Kpi label="Tramo 1" value={contadoPorTramo.tramo_1} />
        <Kpi label="Tramo 2" value={contadoPorTramo.tramo_2} accent="warning" />
        <Kpi label="Tramo 3" value={contadoPorTramo.tramo_3} accent="danger" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setTramoFiltro(c.key)}
              title={c.key === "todos" ? undefined : TRAMO_AYUDA[c.key]}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                tramoFiltro === c.key
                  ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-[#3F8E91]"
                  : "border-slate-200 bg-white text-slate-600 hover:border-[#4FAEB2]/60"
              }`}
            >
              {c.label}
              <span className="tabular-nums text-slate-400">({c.count})</span>
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cliente, teléfono o venta…"
            aria-label="Buscar en cobranzas"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
          />
        </div>
      </div>

      {cobranza && !cobranza.disponible ? (
        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          Este schema no tiene la tabla de ventas, así que no hay crédito que cobrar.
        </p>
      ) : null}

      {/* Lista */}
      {isLoading && !cobranza ? (
        <p className="py-10 text-center text-sm text-slate-400">Cargando…</p>
      ) : filtrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center">
          <HandCoins className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">
            {clientes.length === 0
              ? "No hay nada pendiente de cobro."
              : "No hay clientes con deuda para este filtro."}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {clientes.length === 0
              ? "Acá aparecen las ventas a crédito hasta que se cobran del todo."
              : "Probá con otro tramo o limpiá la búsqueda."}
          </p>
        </div>
      ) : (
        <>
          {hayFiltro ? (
            <p className="text-xs text-slate-500">
              Mostrando {filtrados.length} de {conTramo.length}{" "}
              {conTramo.length === 1 ? "cliente" : "clientes"}.
            </p>
          ) : null}
          <ul className="space-y-3">
            {filtrados.map(({ cliente, tramo }) => (
              <TarjetaCliente
                key={cliente.cliente_id ?? cliente.cliente}
                cliente={cliente}
                tramo={tramo}
                onCobrar={setCobrando}
              />
            ))}
          </ul>
        </>
      )}

      {cobrando ? (
        <ModalCobro
          venta={cobrando}
          onCerrar={() => setCobrando(null)}
          onCobrado={() => {
            setCobrando(null);
            mutate();
          }}
        />
      ) : null}
    </div>
  );
}

function TarjetaCliente({
  cliente,
  tramo,
  onCobrar,
}: {
  cliente: ClienteCobranzaCredito;
  tramo: TramoKey;
  onCobrar: (v: VentaCobranza) => void;
}) {
  return (
    <li className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-bold text-slate-900">{cliente.cliente}</p>
            <TramoBadge tramo={tramo} />
          </div>
          {cliente.telefono ? (
            <a
              href={`tel:${cliente.telefono.replace(/\s+/g, "")}`}
              className="mt-0.5 inline-flex items-center gap-1 text-xs text-[#3F8E91]"
            >
              <Phone className="h-3 w-3" />
              {cliente.telefono}
            </a>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-bold tabular-nums text-slate-900">{gs(cliente.saldo)}</p>
          {cliente.vencido > 0 ? (
            <p className="text-[11px] font-semibold text-rose-600">
              {gs(cliente.vencido)} vencido
            </p>
          ) : null}
        </div>
      </div>

      <ul className="divide-y divide-slate-100">
        {cliente.ventas.map((v) => {
          const est = estadoVencimiento(v.dias_vencida);
          return (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{v.numero_control}</p>
                <p
                  className={`text-[11px] ${est.vencida ? "font-semibold text-rose-600" : "text-slate-500"}`}
                >
                  {est.texto} · {v.vencimiento}
                </p>
                {v.cobrado > 0 ? (
                  <p className="text-[11px] text-slate-400">
                    Cobrado {gs(v.cobrado)} de {gs(v.total)}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-bold tabular-nums text-slate-900">{gs(v.saldo)}</span>
                <button
                  type="button"
                  onClick={() => onCobrar(v)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: TEAL }}
                >
                  Cobrar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function ModalCobro({
  venta,
  onCerrar,
  onCobrado,
}: {
  venta: VentaCobranza;
  onCerrar: () => void;
  onCobrado: () => void;
}) {
  // Arranca con el saldo completo: cobrar todo es lo que pasa casi siempre, y
  // el parcial se escribe encima.
  const [monto, setMonto] = useState(String(Math.round(venta.saldo)));
  const [medio, setMedio] = useState("efectivo");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const montoNum = Number(monto.replace(/\./g, "").replace(",", ".")) || 0;
  const parcial = montoNum > 0 && montoNum < venta.saldo - 0.5;

  async function confirmar() {
    if (guardando) return;
    setGuardando(true);
    setError(null);
    const res = await cobrarVenta(venta.id, montoNum, medio);
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onCobrado();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <h2 className="text-base font-bold text-slate-900">Cobrar {venta.numero_control}</h2>
        <p className="mt-0.5 text-sm text-slate-500">Debe {gs(venta.saldo)}.</p>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Monto cobrado</span>
          <input
            inputMode="numeric"
            value={monto}
            onChange={(e) => {
              setError(null);
              setMonto(e.target.value);
            }}
            className="h-11 w-full rounded-lg border border-slate-200 px-3 text-lg font-bold tabular-nums outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            autoFocus
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Con qué pagó</span>
          <select
            value={medio}
            onChange={(e) => setMedio(e.target.value)}
            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          >
            {METODOS_PAGO.filter((m) => m.value !== "mixto").map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        {parcial ? (
          <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
            Cobro parcial: le quedan debiendo {gs(venta.saldo - montoNum)}.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-600 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={guardando || montoNum <= 0}
            className="flex-1 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: TEAL }}
          >
            {guardando ? "Registrando…" : "Registrar cobro"}
          </button>
        </div>
      </div>
    </div>
  );
}
