"use client";

/**
 * Resumen consolidado de caja (pedido Distribuidora JM, 14-nov-2026 #1E).
 *
 * Una pantalla donde la clienta ve lado a lado cuánta plata corresponde al
 * salón y cuánta a cada camión, en el período que elija. El objetivo es
 * identificar rápido el origen del dinero sin tener que ir a tres reportes
 * distintos.
 *
 * Fuente: /api/ventas (trae reparto_etiqueta = camión o null = salón) +
 * /api/reportes/ingresos-egresos (para los egresos por período). Agrupa en
 * el cliente: no toca la base ni crea endpoints nuevos, cero riesgo de pisar
 * otros reportes que ya andan.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Store, Truck } from "lucide-react";
import { apiFetch } from "@/lib/api/fetch-with-supabase-session";
import { FechaSelect } from "@/components/ui/FechaSelect";

const TZ = "America/Asuncion";
const gs = (n: number) => `Gs. ${Math.round(Number(n) || 0).toLocaleString("es-PY")}`;

type VentaRow = {
  numero_control: string;
  total: number | string;
  tipo_venta: string;
  estado?: string | null;
  metodo_pago?: string | null;
  reparto_etiqueta?: string | null;
  fecha: string;
};

type MovRow = {
  dia: string;
  tipo: "ingreso" | "egreso" | "retiro" | "ajuste";
  concepto: string;
  monto: number;
  medio_pago?: string | null;
  manual?: boolean;
};

type Origen = {
  clave: string;
  titulo: string;
  icono: "salon" | "camion";
  ventas_contado: number;
  ventas_credito: number;
  cantidad_ventas: number;
};

function hoyAsuncion(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function primeroDelMes(): string {
  const [y, m] = hoyAsuncion().split("-");
  return `${y}-${m}-01`;
}
function diaAsuncion(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

const CARD = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";

export default function ConsolidadoCajaPage() {
  const [desde, setDesde] = useState(primeroDelMes());
  const [hasta, setHasta] = useState(hoyAsuncion());
  const [ventas, setVentas] = useState<VentaRow[]>([]);
  const [movs, setMovs] = useState<MovRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const [rV, rM] = await Promise.all([
        apiFetch(`/api/ventas`, { cache: "no-store" }),
        apiFetch(`/api/reportes/ingresos-egresos?desde=${desde}&hasta=${hasta}`, { cache: "no-store" }),
      ]);
      const jV = (await rV.json().catch(() => ({}))) as { data?: { ventas?: VentaRow[] } };
      const jM = (await rM.json().catch(() => ({}))) as {
        data?: { ingresos?: MovRow[]; egresos?: MovRow[] };
      };
      setVentas(jV.data?.ventas ?? []);
      // Solo los egresos manuales (los automáticos de venta ya están en "ventas")
      const egresos = (jM.data?.egresos ?? []).filter((m) => m.manual);
      const ingresos = (jM.data?.ingresos ?? []).filter((m) => m.manual);
      setMovs([...ingresos, ...egresos]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally { setCargando(false); }
  }, [desde, hasta]);

  useEffect(() => { void cargar(); }, [cargar]);

  // Agrupar por origen (salón o cada camión), filtrando por rango y descartando anuladas.
  const origenes = useMemo<Origen[]>(() => {
    const filtradas = ventas.filter((v) => {
      if ((v.estado ?? "").toLowerCase() === "anulada") return false;
      const d = diaAsuncion(v.fecha);
      return d >= desde && d <= hasta;
    });
    const map = new Map<string, Origen>();
    const push = (clave: string, titulo: string, icono: "salon" | "camion", v: VentaRow) => {
      const o = map.get(clave) ?? { clave, titulo, icono, ventas_contado: 0, ventas_credito: 0, cantidad_ventas: 0 };
      const total = Number(v.total) || 0;
      if ((v.tipo_venta ?? "").toUpperCase() === "CREDITO") o.ventas_credito += total;
      else o.ventas_contado += total;
      o.cantidad_ventas += 1;
      map.set(clave, o);
    };
    for (const v of filtradas) {
      if (v.reparto_etiqueta) push(v.reparto_etiqueta, v.reparto_etiqueta, "camion", v);
      else push("salon", "Salón", "salon", v);
    }
    return [...map.values()].sort((a, b) => {
      if (a.clave === "salon") return -1;
      if (b.clave === "salon") return 1;
      return a.titulo.localeCompare(b.titulo);
    });
  }, [ventas, desde, hasta]);

  const totalIngresosManuales = movs.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0);
  const totalEgresosManuales = movs.filter((m) => m.tipo === "egreso" || m.tipo === "retiro").reduce((s, m) => s + m.monto, 0);

  const totalGeneral = origenes.reduce((s, o) => s + o.ventas_contado + o.ventas_credito, 0) + totalIngresosManuales - totalEgresosManuales;

  return (
    <div className="w-full min-w-0 space-y-5">
      <Link href="/reportes" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
        ← Volver a Reportes
      </Link>

      <div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Reportes · Caja</p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Resumen consolidado de caja</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cuánta plata corresponde al salón y cuánta a cada camión en el período. Evita sumar dos veces
          cobros ya contabilizados — cada venta queda en su origen, los ingresos/egresos manuales en Otros.
        </p>
      </div>

      <div className={`${CARD} flex flex-wrap items-end gap-3`}>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Desde</label>
          <FechaSelect value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Hasta</label>
          <FechaSelect value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          disabled={cargando}
          className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50"
        >
          {cargando ? "Generando…" : "Actualizar"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {/* Cards por origen */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {origenes.map((o) => (
          <OrigenCard key={o.clave} o={o} />
        ))}
        {/* Otros ingresos/egresos manuales (no vienen de una venta ni de un camión) */}
        {(totalIngresosManuales > 0 || totalEgresosManuales > 0) ? (
          <div className={CARD}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-900">Otros ingresos / egresos</h3>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                MANUALES
              </span>
            </div>
            <p className="mt-3 text-xs text-slate-500">Ingresos manuales</p>
            <p className="text-lg font-semibold tabular-nums text-emerald-700">{gs(totalIngresosManuales)}</p>
            <p className="mt-2 text-xs text-slate-500">Egresos / retiros manuales</p>
            <p className="text-lg font-semibold tabular-nums text-rose-700">{gs(totalEgresosManuales)}</p>
            <p className="mt-3 text-xs text-slate-500">Neto</p>
            <p className="text-xl font-bold tabular-nums text-slate-900">
              {gs(totalIngresosManuales - totalEgresosManuales)}
            </p>
          </div>
        ) : null}
      </div>

      {/* Total general */}
      <div className={`${CARD} border-[#4FAEB2]/60 bg-[#4FAEB2]/5`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#4FAEB2]">Total general del período</p>
            <p className="mt-1 text-xs text-slate-500">
              Ventas del salón + ventas de cada camión + ingresos manuales − egresos manuales.
            </p>
          </div>
          <p className={`text-2xl font-bold tabular-nums ${totalGeneral < 0 ? "text-rose-700" : "text-slate-900"}`}>{gs(totalGeneral)}</p>
        </div>
      </div>

      <p className="text-[11px] text-slate-400">
        <b>Nota:</b> Las cobranzas de créditos del período ya están contadas dentro de cada venta (y en el reporte de
        Ingresos y Egresos). Este consolidado muestra ventas por origen para no duplicar.
      </p>
    </div>
  );
}

function OrigenCard({ o }: { o: Origen }) {
  const total = o.ventas_contado + o.ventas_credito;
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {o.icono === "salon" ? (
            <Store className="h-4 w-4 text-[#4FAEB2]" />
          ) : (
            <Truck className="h-4 w-4 text-amber-600" />
          )}
          <h3 className="text-sm font-semibold text-slate-900">{o.titulo}</h3>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
          {o.cantidad_ventas} ventas
        </span>
      </div>
      <p className="mt-3 text-xs text-slate-500">Al contado</p>
      <p className="text-lg font-semibold tabular-nums text-slate-900">{gs(o.ventas_contado)}</p>
      <p className="mt-2 text-xs text-slate-500">A crédito</p>
      <p className="text-lg font-semibold tabular-nums text-amber-700">{gs(o.ventas_credito)}</p>
      <p className="mt-3 text-xs text-slate-500">Total</p>
      <p className="text-xl font-bold tabular-nums text-slate-900">{gs(total)}</p>
    </div>
  );
}
