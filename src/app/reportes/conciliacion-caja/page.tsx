"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/fetch-with-supabase-session";
import { FechaSelect } from "@/components/ui/FechaSelect";

type Mov = {
  id: string;
  fecha: string;
  hora: string;
  concepto: string;
  monto: number;
  medio: string;
  responsable: string | null;
  otro_dia: boolean;
  tipo: string;
  grupo?: string;
};
type Caja = {
  id: string;
  numero_caja: number;
  estado: string;
  apertura: number;
  sencillo: number;
  ventas_efectivo: number;
  ventas_otros_medios: number;
  egresos: Mov[];
  cortes: Mov[];
  ingresos_externos: Mov[];
  ajustes: Mov[];
  totales: {
    egresos: number;
    cortes: number;
    ingresos_externos_efectivo: number;
    ingresos_externos_otros: number;
    ajustes: number;
    efectivo_ingresado: number;
    esperado: number;
    contado: number | null;
    diferencia: number | null;
  };
};
type Datos = {
  fecha: string;
  cajas: Caja[];
  consolidado: {
    salon_efectivo: number;
    salon_otros_medios: number;
    camiones: { nombre: string; efectivo: number; otros: number }[];
    otros_externos: { efectivo: number; otros: number };
    total_general: number;
  };
};

const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString("es-PY");
const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
const MEDIO: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", cheque: "Cheque", otro: "Otro" };

function Cuadro({ titulo, color, children }: { titulo: string; color: string; children: React.ReactNode }) {
  return (
    <section className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${color}`}>
      <div className="border-b border-inherit px-3 py-2 text-xs font-bold uppercase tracking-wide">{titulo}</div>
      {children}
    </section>
  );
}

function TablaMovs({
  movs,
  vacio,
  onAnular,
  conGrupo,
}: {
  movs: Mov[];
  vacio: string;
  onAnular: (m: Mov) => void;
  conGrupo?: boolean;
}) {
  if (movs.length === 0) return <p className="px-3 py-4 text-sm text-slate-400">{vacio}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-xs">
        <thead className="border-b bg-slate-50 text-slate-500">
          <tr>
            <th className="px-2 py-1.5 text-left">Fecha</th>
            <th className="px-2 py-1.5 text-left">Hora</th>
            <th className="px-2 py-1.5 text-left">Concepto</th>
            {conGrupo ? <th className="px-2 py-1.5 text-left">Corresponde a</th> : null}
            <th className="px-2 py-1.5 text-left">Medio</th>
            <th className="px-2 py-1.5 text-right">Importe</th>
            <th className="px-2 py-1.5 text-left">Responsable</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {movs.map((m) => (
            <tr key={m.id} className={`border-b last:border-0 ${m.otro_dia ? "bg-amber-50" : ""}`}>
              <td className="px-2 py-1.5 whitespace-nowrap">
                {m.fecha.slice(8, 10)}/{m.fecha.slice(5, 7)}
                {m.otro_dia ? <span className="ml-1 rounded bg-amber-200 px-1 text-[10px] font-semibold text-amber-900">otro día</span> : null}
              </td>
              <td className="px-2 py-1.5">{m.hora}</td>
              <td className="px-2 py-1.5">{m.concepto}</td>
              {conGrupo ? <td className="px-2 py-1.5">{m.grupo || "Otros"}</td> : null}
              <td className="px-2 py-1.5">{MEDIO[m.medio] ?? m.medio}</td>
              <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{fmt(m.monto)}</td>
              <td className="px-2 py-1.5 text-slate-500">{m.responsable ?? "—"}</td>
              <td className="px-2 py-1.5 text-right">
                <button onClick={() => onAnular(m)} className="text-red-600 hover:underline">Anular</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Fila({ k, v, fuerte, signo }: { k: string; v: number | string; fuerte?: boolean; signo?: "-" | "+" }) {
  return (
    <div className={`flex items-center justify-between px-3 py-1.5 text-sm ${fuerte ? "bg-slate-50 font-bold" : ""}`}>
      <span>{k}</span>
      <span className="tabular-nums">{typeof v === "number" ? `${signo === "-" ? "− " : ""}Gs. ${fmt(v)}` : v}</span>
    </div>
  );
}

export default function ConciliacionCajaPage() {
  const [fecha, setFecha] = useState(hoy());
  const [data, setData] = useState<Datos | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("fecha");
    if (f && /^\d{4}-\d{2}-\d{2}$/.test(f)) setFecha(f);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/cajas/conciliacion?fecha=${fecha}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) {
        setError(j?.error ?? `Error ${r.status}`);
        setData(null);
        return;
      }
      setData(j.data as Datos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [fecha]);

  useEffect(() => {
    void load();
  }, [load]);

  async function anular(m: Mov) {
    const motivo = window.prompt(`Motivo para anular «${m.concepto}» (Gs. ${fmt(m.monto)}). El movimiento queda registrado como anulado:`);
    if (!motivo || !motivo.trim()) return;
    const r = await apiFetch(`/api/caja-movimientos/${encodeURIComponent(m.id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo: motivo.trim() }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.success) {
      window.alert(j?.error ?? "No se pudo anular.");
      return;
    }
    void load();
  }

  const c = data?.consolidado;

  return (
    <div className="w-full min-w-0 space-y-5">
      <div>
        <nav className="mb-1 text-xs text-slate-500">
          <Link href="/reportes" className="hover:text-[#4FAEB2]">Reportes</Link> /{" "}
          <span className="font-semibold text-slate-700">Conciliación de caja</span>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Conciliación de caja</h1>
        <p className="mt-1 text-sm text-slate-500">
          Egresos, cortes de efectivo y rendiciones por separado, con el efectivo esperado y la diferencia de cada caja del día.
          Los cobros de ventas se cuentan una sola vez. Los movimientos de otro día aparecen marcados.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-xs font-semibold text-slate-500">Día
          <FechaSelect value={fecha} onChange={(e) => setFecha(e.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        </label>
        <button onClick={load} className="rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91]">Actualizar</button>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {loading && !data ? <p className="text-sm text-slate-400">Cargando…</p> : null}
      {data && data.cajas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No hay cajas ese día.</p>
      ) : null}

      {data?.cajas.map((k) => (
        <div key={k.id} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-3">
          <h2 className="text-lg font-semibold text-slate-800">
            Caja {k.numero_caja} <span className="text-xs font-normal text-slate-500">({k.estado})</span>
          </h2>

          <Cuadro titulo="A. Egresos de la caja del salón" color="border-red-200 text-red-800">
            <TablaMovs movs={k.egresos} vacio="Sin egresos." onAnular={anular} />
            <Fila k="Total egresos en efectivo" v={k.totales.egresos} fuerte />
          </Cuadro>

          <Cuadro titulo="B. Cortes de efectivo del salón" color="border-amber-200 text-amber-800">
            <TablaMovs movs={k.cortes} vacio="Sin cortes." onAnular={anular} />
            <Fila k="Total acumulado de cortes (efectivo)" v={k.totales.cortes} fuerte />
          </Cuadro>

          <Cuadro titulo="C. Ingresos y rendiciones externas" color="border-emerald-200 text-emerald-800">
            <TablaMovs movs={k.ingresos_externos} vacio="Sin rendiciones ni ingresos externos." onAnular={anular} conGrupo />
            <Fila k="Efectivo recibido" v={k.totales.ingresos_externos_efectivo} />
            <Fila k="Transferencias y otros medios (no entran al cajón)" v={k.totales.ingresos_externos_otros} />
          </Cuadro>

          <Cuadro titulo="D. Resumen del efectivo del salón" color="border-slate-300 text-slate-800">
            <Fila k="Apertura de caja" v={k.apertura} />
            {k.sencillo > 0 ? <Fila k="Sencillo" v={k.sencillo} /> : null}
            <Fila k="Ventas cobradas en efectivo" v={k.ventas_efectivo} />
            <Fila k="Otros ingresos de efectivo al salón" v={k.totales.ingresos_externos_efectivo} />
            <Fila k="Total de efectivo ingresado" v={k.totales.efectivo_ingresado} fuerte />
            <Fila k="Egresos en efectivo" v={k.totales.egresos} signo="-" />
            <Fila k="Cortes y retiros de efectivo" v={k.totales.cortes} signo="-" />
            {k.totales.ajustes !== 0 ? <Fila k="Ajustes" v={k.totales.ajustes} /> : null}
            <Fila k="Efectivo esperado al cierre" v={k.totales.esperado} fuerte />
            <Fila k="Efectivo contado (arqueo)" v={k.totales.contado === null ? "Sin cerrar" : `Gs. ${fmt(k.totales.contado)}`} />
            <Fila
              k="Diferencia (faltante / sobrante)"
              v={k.totales.diferencia === null ? "—" : `Gs. ${fmt(k.totales.diferencia)}`}
              fuerte
            />
          </Cuadro>
        </div>
      ))}

      {c && data && data.cajas.length > 0 ? (
        <Cuadro titulo="E. Resumen consolidado del día" color="border-sky-200 text-sky-900">
          <div className="grid gap-px bg-slate-100 sm:grid-cols-2">
            <div className="bg-white">
              <Fila k="1. Efectivo del salón (ventas)" v={c.salon_efectivo} />
              <Fila k="    Ventas del salón por otros medios" v={c.salon_otros_medios} />
            </div>
            {c.camiones.map((x, i) => (
              <div key={x.nombre} className="bg-white">
                <Fila k={`${i + 2}. Rendiciones ${x.nombre}`} v={x.efectivo + x.otros} />
                <Fila k="    Efectivo / otros medios" v={`${fmt(x.efectivo)} / ${fmt(x.otros)}`} />
              </div>
            ))}
            <div className="bg-white">
              <Fila k={`${c.camiones.length + 2}. Otros ingresos externos`} v={c.otros_externos.efectivo + c.otros_externos.otros} />
              <Fila k="    Efectivo / otros medios" v={`${fmt(c.otros_externos.efectivo)} / ${fmt(c.otros_externos.otros)}`} />
            </div>
          </div>
          <Fila k="Total general cobrado" v={c.total_general} fuerte />
        </Cuadro>
      ) : null}
    </div>
  );
}
