"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/fetch-with-supabase-session";
import { FechaSelect } from "@/components/ui/FechaSelect";
import ExportExcelButton from "@/components/ui/ExportExcelButton";

type FilaCorte = { etiqueta: string; total: number; ventas: number; participacion: number };
type Reporte = {
  desde: string;
  hasta: string;
  disponible: boolean;
  resumen: {
    total: number; ventas: number; ticket_promedio: number; contado: number;
    credito: number; unidades: number; dias_con_venta: number; promedio_diario: number;
  };
  por_dia: { dia: string; total: number; ventas: number }[];
  por_cliente: FilaCorte[];
  por_producto: { producto: string; cantidad: number; total: number; participacion: number }[];
  por_metodo: FilaCorte[];
  sin_datos: string[];
};

const gs = (n: number) => `Gs. ${Math.round(Number(n) || 0).toLocaleString("es-PY")}`;
const cant = (n: number) =>
  (Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString("es-PY", { maximumFractionDigits: 3 });
const pct = (n: number) => `${(Number(n) || 0).toFixed(1)}%`;
const dia = (s: string) => {
  const [y, m, d] = String(s).slice(0, 10).split("-");
  return d ? `${d}/${m}/${y}` : s;
};

const primeroDelMes = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const CARD = "rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm";
const TH = "px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500";
const TD = "px-3 py-2.5 text-sm text-slate-700";

export default function ReporteVentasPage() {
  const [desde, setDesde] = useState(primeroDelMes());
  const [hasta, setHasta] = useState(hoy());
  const [data, setData] = useState<Reporte | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/reportes/ventas?desde=${desde}&hasta=${hasta}`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string; data?: Reporte };
      if (!r.ok || !j.success || !j.data) {
        setError(j.error ?? `Error ${r.status}`);
        setData(null);
        return;
      }
      setData(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const maxDia = data ? Math.max(...data.por_dia.map((d) => d.total), 1) : 1;

  return (
    <div className="w-full min-w-0 space-y-5">
      <Link href="/reportes" className="inline-flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-slate-600">
        ← Volver a Reportes
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Reportes · Comercial</p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Ventas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Qué se vendió en el período, a quién, de qué producto y cómo se cobró.
          </p>
        </div>
        <ExportExcelButton url={`/api/reportes/ventas/export?desde=${desde}&hasta=${hasta}`} />
      </div>

      {/* Filtros */}
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
          className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#3F8E91] disabled:opacity-50"
        >
          {cargando ? "Generando…" : "Actualizar"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm font-medium text-rose-700">No se pudo generar el reporte.</p>
          <p className="mt-1 text-xs text-rose-600">{error}</p>
        </div>
      ) : null}

      {data && !data.disponible ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Este sistema todavía no tiene registradas ventas: la tabla no existe en la base.
        </div>
      ) : null}

      {data?.sin_datos.length ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
          Este período no puede desglosarse {data.sin_datos.join(", ")}: faltan esos datos en las ventas registradas.
        </p>
      ) : null}

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total vendido", valor: gs(data?.resumen.total ?? 0), sub: `${data?.resumen.ventas ?? 0} ventas` },
          { label: "Ticket promedio", valor: gs(data?.resumen.ticket_promedio ?? 0), sub: "por venta" },
          { label: "Contado", valor: gs(data?.resumen.contado ?? 0), sub: "cobrado en el momento" },
          { label: "Crédito", valor: gs(data?.resumen.credito ?? 0), sub: "queda por cobrar" },
        ].map((k) => (
          <div key={k.label} className={CARD}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{k.label}</p>
            <p className="mt-1.5 text-xl font-semibold tabular-nums text-slate-900">{k.valor}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Por día */}
      <div className={CARD}>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">Venta por día</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {data?.resumen.dias_con_venta ?? 0} días con venta · promedio {gs(data?.resumen.promedio_diario ?? 0)} por día con venta
        </p>
        {cargando ? (
          <p className="py-8 text-center text-sm text-slate-400">Generando…</p>
        ) : !data?.por_dia.length ? (
          <p className="py-8 text-center text-sm text-slate-400">No hubo ventas en este período.</p>
        ) : (
          <div className="mt-4 space-y-1.5">
            {data.por_dia.map((d) => (
              <div key={d.dia} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs tabular-nums text-slate-500">{dia(d.dia)}</span>
                <div className="h-4 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[#4FAEB2]" style={{ width: `${Math.max((d.total / maxDia) * 100, 2)}%` }} />
                </div>
                <span className="w-32 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700">{gs(d.total)}</span>
                <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-slate-400">{d.ventas} vta.</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TablaCorte titulo="Por cliente" bajada="Quién compra más" filas={data?.por_cliente ?? []} cargando={cargando} />
        <TablaCorte titulo="Por método de pago" bajada="Cómo se cobró" filas={data?.por_metodo ?? []} cargando={cargando} />
      </div>

      {/* Por producto */}
      <div className={CARD}>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">Por producto</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">Qué se vendió, en unidades y en plata</p>
        {cargando ? (
          <p className="py-8 text-center text-sm text-slate-400">Generando…</p>
        ) : !data?.por_producto.length ? (
          <p className="py-8 text-center text-sm text-slate-400">Sin datos para este período.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className={TH}>Producto</th>
                  <th className={`${TH} text-right`}>Cantidad</th>
                  <th className={`${TH} text-right`}>Total</th>
                  <th className={`${TH} text-right`}>Participación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.por_producto.map((p) => (
                  <tr key={p.producto} className="hover:bg-slate-50/60">
                    <td className={TD}>{p.producto}</td>
                    <td className={`${TD} text-right tabular-nums`}>{cant(p.cantidad)}</td>
                    <td className={`${TD} text-right font-semibold tabular-nums`}>{gs(p.total)}</td>
                    <td className={`${TD} text-right tabular-nums text-slate-500`}>{pct(p.participacion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TablaCorte({
  titulo, bajada, filas, cargando,
}: { titulo: string; bajada: string; filas: FilaCorte[]; cargando: boolean }) {
  return (
    <div className={CARD}>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">{titulo}</h2>
      <p className="mt-0.5 text-[11px] text-slate-500">{bajada}</p>
      {cargando ? (
        <p className="py-8 text-center text-sm text-slate-400">Generando…</p>
      ) : filas.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">Sin datos para este período.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80">
              <tr>
                <th className={TH}>Nombre</th>
                <th className={`${TH} text-right`}>Ventas</th>
                <th className={`${TH} text-right`}>Total</th>
                <th className={`${TH} text-right`}>%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((f) => (
                <tr key={f.etiqueta} className="hover:bg-slate-50/60">
                  <td className={TD}>{f.etiqueta}</td>
                  <td className={`${TD} text-right tabular-nums text-slate-500`}>{f.ventas}</td>
                  <td className={`${TD} text-right font-semibold tabular-nums`}>{gs(f.total)}</td>
                  <td className={`${TD} text-right tabular-nums text-slate-500`}>{pct(f.participacion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
