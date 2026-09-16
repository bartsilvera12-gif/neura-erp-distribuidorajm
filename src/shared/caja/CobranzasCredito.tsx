"use client";

import { useState } from "react";
import { HandCoins, Phone, RefreshCw } from "lucide-react";
import { useCobranzaCredito } from "@/shared/hooks/useCobranzaCredito";
import { cobrarVenta, type VentaCobranza } from "@/lib/cobranzas/credito";
import { METODOS_PAGO } from "@/lib/ventas/types";

const TEAL = "#4FAEB2";
const TINTA = "#0B3A3D";

function gs(v: number): string {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}

/** "vence en 3 días" / "vencida hace 12 días" / "vence hoy". */
function estadoVencimiento(dias: number): { texto: string; vencida: boolean } {
  if (dias > 0) return { texto: `Vencida hace ${dias} ${dias === 1 ? "día" : "días"}`, vencida: true };
  if (dias === 0) return { texto: "Vence hoy", vencida: true };
  const faltan = -dias;
  return { texto: `Vence en ${faltan} ${faltan === 1 ? "día" : "días"}`, vencida: false };
}

/**
 * Cobranzas de ventas a crédito.
 *
 * Lo que se cobra en la ruta es la venta fiada, no una factura de suscripción:
 * la deuda es el total de la venta menos lo que se le fue cobrando, sin una
 * tabla intermedia que pueda quedar desfasada.
 *
 * El cobro entra como ingreso de caja imputado a esa venta, así que aparece
 * solo en el arqueo del día. El vendedor no carga nada dos veces.
 */
export default function CobranzasCredito() {
  const { cobranza, isLoading, mutate } = useCobranzaCredito();
  const [cobrando, setCobrando] = useState<VentaCobranza | null>(null);

  const resumen = cobranza?.resumen;

  return (
    <div className="mx-auto max-w-3xl p-4 pb-24 sm:p-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Cobranzas</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Ventas a crédito con saldo pendiente
            {cobranza?.alcance === "propias" ? ", de tus repartos" : ""}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => mutate()}
          aria-label="Actualizar cobranzas"
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </header>

      {resumen && resumen.ventas > 0 ? (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl p-3 text-white" style={{ backgroundColor: TINTA }}>
            <p className="text-[11px] uppercase tracking-wider text-white/70">Por cobrar</p>
            <p className="text-lg font-bold tabular-nums">{gs(resumen.total)}</p>
            <p className="text-[11px] text-white/60">
              {resumen.ventas} {resumen.ventas === 1 ? "venta" : "ventas"} · {resumen.clientes}{" "}
              {resumen.clientes === 1 ? "cliente" : "clientes"}
            </p>
          </div>
          <div
            className="rounded-xl p-3 text-white"
            style={{ backgroundColor: resumen.vencido > 0 ? "#B04B4B" : "#5B6B7A" }}
          >
            <p className="text-[11px] uppercase tracking-wider text-white/70">Vencido</p>
            <p className="text-lg font-bold tabular-nums">{gs(resumen.vencido)}</p>
            <p className="text-[11px] text-white/60">
              {resumen.vencido > 0 ? "Hay que salir a buscarlo" : "Nada vencido"}
            </p>
          </div>
        </div>
      ) : null}

      {cobranza && !cobranza.disponible ? (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          Este schema no tiene la tabla de ventas, así que no hay crédito que cobrar.
        </p>
      ) : null}

      {isLoading && !cobranza ? (
        <p className="py-10 text-center text-sm text-slate-400">Cargando…</p>
      ) : cobranza && cobranza.clientes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
          <HandCoins className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">No hay nada pendiente de cobro.</p>
          <p className="mt-1 text-xs text-slate-400">
            Acá aparecen las ventas a crédito hasta que se cobran del todo.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {(cobranza?.clientes ?? []).map((c) => (
            <li
              key={c.cliente_id ?? c.cliente}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{c.cliente}</p>
                  {c.telefono ? (
                    <a
                      href={`tel:${c.telefono.replace(/\s+/g, "")}`}
                      className="mt-0.5 inline-flex items-center gap-1 text-xs text-[#3F8E91]"
                    >
                      <Phone className="h-3 w-3" />
                      {c.telefono}
                    </a>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-base font-bold tabular-nums text-slate-900">{gs(c.saldo)}</p>
                  {c.vencido > 0 ? (
                    <p className="text-[11px] font-semibold text-red-600">
                      {gs(c.vencido)} vencido
                    </p>
                  ) : null}
                </div>
              </div>

              <ul className="divide-y divide-slate-100">
                {c.ventas.map((v) => {
                  const est = estadoVencimiento(v.dias_vencida);
                  return (
                    <li key={v.id} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {v.numero_control}
                        </p>
                        <p
                          className={`text-[11px] ${est.vencida ? "font-semibold text-red-600" : "text-slate-500"}`}
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
                        <span className="text-sm font-bold tabular-nums text-slate-900">
                          {gs(v.saldo)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCobrando(v)}
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
          ))}
        </ul>
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
