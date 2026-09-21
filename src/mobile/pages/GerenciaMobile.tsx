"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Package, Truck } from "lucide-react";
import { useGerenciaComercial } from "@/shared/hooks/useGerencia";
import { gs, gsShort, pct, pctColor } from "@/lib/report/format";

const TEAL = "#4FAEB2";

/**
 * Gerencia en el celular: cuánto se vendió este mes, qué camión lo vendió y qué
 * producto.
 *
 * Es la versión chica del mismo reporte del escritorio, sin el gráfico por día:
 * en una pantalla de mano el detalle diario no se lee, así que queda el mejor
 * día y el promedio, que son los dos números que se miran de parado.
 */
export default function GerenciaMobile() {
  const [period, setPeriod] = useState(currentPeriod());
  const { report, isLoading, error } = useGerenciaComercial(period);
  const r = report?.resumen;

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <header className="mb-3">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Gerencia</h1>
        <p className="mt-0.5 text-xs text-slate-500">Venta por día, camión y producto</p>
      </header>

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPeriod(addMonth(period, -1))}
          aria-label="Mes anterior"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-sm font-medium text-slate-900">
          {formatPeriod(period)}
        </div>
        <button
          type="button"
          onClick={() => setPeriod(addMonth(period, 1))}
          disabled={period >= currentPeriod()}
          aria-label="Mes siguiente"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 disabled:opacity-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar el reporte.
        </div>
      ) : null}

      {report && !report.disponible ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Este schema todavía no tiene la tabla de ventas.
        </div>
      ) : null}

      <section className="mb-4 grid grid-cols-2 gap-3">
        <Caja
          label="Venta del mes"
          value={r ? gsShort(r.total) : "—"}
          sub={r?.variacion_pct == null ? undefined : `${pct(r.variacion_pct)} vs mes anterior`}
          subColor={r?.variacion_pct == null ? undefined : pctColor(r.variacion_pct)}
          destacado
          cargando={isLoading}
        />
        <Caja label="Ventas" value={r ? String(r.ventas) : "—"} cargando={isLoading} />
        <Caja
          label="Ticket promedio"
          value={r && r.ventas > 0 ? gsShort(r.ticket_promedio) : "—"}
          cargando={isLoading}
        />
        <Caja
          label="Promedio por día"
          value={r && r.dias_con_venta > 0 ? gsShort(r.promedio_diario) : "—"}
          sub={r ? `${r.dias_con_venta} ${r.dias_con_venta === 1 ? "día" : "días"} con venta` : undefined}
          cargando={isLoading}
        />
        <Caja label="Al contado" value={r ? gsShort(r.contado) : "—"} cargando={isLoading} />
        <Caja label="A crédito" value={r ? gsShort(r.credito) : "—"} cargando={isLoading} />
      </section>

      {r?.mejor_dia ? (
        <div className="mb-4 rounded-2xl border border-[#4FAEB2]/30 bg-[#4FAEB2]/5 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Mejor día del mes</p>
          <p className="mt-0.5 text-sm font-bold text-slate-900">
            {diaLargo(r.mejor_dia.dia)} · {gs(r.mejor_dia.total)}
          </p>
        </div>
      ) : null}

      <Ranking
        titulo="Por camión"
        icono={<Truck className="h-3.5 w-3.5" />}
        vacio="Todavía no hay ventas asociadas a un reparto."
        filas={(report?.por_camion ?? []).map((c) => ({
          nombre: c.camion,
          detalle: `${c.ventas} ${c.ventas === 1 ? "venta" : "ventas"}`,
          total: c.total,
          participacion: c.participacion,
        }))}
      />

      <Ranking
        titulo="Por producto"
        icono={<Package className="h-3.5 w-3.5" />}
        vacio="No hubo productos vendidos este mes."
        filas={(report?.por_producto ?? []).slice(0, 10).map((p) => ({
          nombre: p.producto,
          detalle: cant(p.cantidad, p.unidad),
          total: p.total,
          participacion: p.participacion,
        }))}
      />
    </div>
  );
}

// ── Piezas ───────────────────────────────────────────────────────────────────

function Caja({
  label,
  value,
  sub,
  subColor,
  destacado,
  cargando,
}: {
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
  destacado?: boolean;
  cargando?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 ${
        destacado ? "border-[#4FAEB2]/40 bg-[#4FAEB2]/5" : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
        {cargando && value === "—" ? "…" : value}
      </p>
      {sub ? <p className={`mt-0.5 text-[11px] ${subColor ?? "text-slate-400"}`}>{sub}</p> : null}
    </div>
  );
}

function Ranking({
  titulo,
  icono,
  vacio,
  filas,
}: {
  titulo: string;
  icono: React.ReactNode;
  vacio: string;
  filas: { nombre: string; detalle: string; total: number; participacion: number }[];
}) {
  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span className="text-[#4FAEB2]">{icono}</span>
        {titulo}
      </h2>
      {filas.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">{vacio}</p>
      ) : (
        <ul className="space-y-2.5">
          {filas.map((f) => (
            <li key={f.nombre}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                  {f.nombre}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-slate-900">
                  {gsShort(f.total)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(2, Math.round(f.participacion * 100))}%`,
                      backgroundColor: TEAL,
                    }}
                  />
                </div>
                <span className="shrink-0 text-[11px] text-slate-400">{f.detalle}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function cant(n: number, unidad: string): string {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
  return unidad ? `${s} ${unidad}` : s;
}

function diaLargo(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" });
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonth(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatPeriod(p: string): string {
  const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const [y, m] = p.split("-").map(Number);
  return `${meses[m - 1]} ${y}`;
}
