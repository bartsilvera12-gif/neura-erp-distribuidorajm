"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, Printer } from "lucide-react";
import { apiFetch } from "@/lib/api/fetch-with-supabase-session";
import { nombreMes, nombreSemana } from "@/lib/reportes/compras-semanal";
import type { ArqueoMensual, FilaArqueo, Totales } from "@/lib/reportes/arqueo-mensual";

/**
 * Arqueo del mes, como la planilla «ARQUEO DIARIO» de la distribuidora: una
 * tabla por persona (cada camionero y el salón), un renglón por día, el
 * subtotal de cada semana, el total del mes y el total general.
 */

const gs = (n: number | null | undefined) => (n == null ? "" : Math.round(Number(n) || 0).toLocaleString("es-PY"));
const corto = (n: number) => (n >= 1_000_000 ? `${Math.round(n / 1_000_000)} M` : gs(n));
const mesActual = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date()).slice(0, 7);
const fechaCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const COLORES = ["#0B3A3D", "#4FAEB2", "#C77B30", "#4F6D9E", "#B04B4B", "#5B6B7A"];

/** Columnas de la planilla, en el mismo orden. */
const COLUMNAS: { titulo: string; valor: (f: FilaArqueo | Totales) => number | null; ayuda?: string }[] = [
  { titulo: "Contado", valor: (f) => f.contado },
  { titulo: "Cobranzas", valor: (f) => f.cobranzas + f.otros, ayuda: "Cobros de créditos y otros ingresos" },
  { titulo: "Crédito", valor: (f) => f.credito },
  { titulo: "Cheque", valor: (f) => f.cheque },
  { titulo: "Transf.", valor: (f) => f.transferencia },
  { titulo: "Gastos", valor: (f) => f.gastos },
  { titulo: "Crédito y contado", valor: (f) => f.vendido },
  { titulo: "Debe rendir", valor: (f) => f.debe },
  { titulo: "Efectivo", valor: (f) => f.efectivo },
  { titulo: "Rendición total", valor: (f) => f.rendicion },
  { titulo: "Diferencia", valor: (f) => f.diferencia },
];

export default function ArqueoMensualPage() {
  const [mes, setMes] = useState(mesActual());
  const [data, setData] = useState<ArqueoMensual | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/reportes/arqueo-mensual?mes=${mes}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) throw new Error(j?.error ?? `Error ${r.status}`);
      setData(j.data as ArqueoMensual);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el reporte.");
      setData(null);
    } finally {
      setCargando(false);
    }
  }, [mes]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Gráfico: lo vendido por semana, una barra por persona.
  const semanasN = [...new Set((data?.personas ?? []).flatMap((p) => p.semanas.map((s) => s.n)))].sort((a, b) => a - b);
  const grafico = semanasN.map((n) => {
    const fila: Record<string, string | number> = { semana: `Sem ${n}` };
    for (const p of data?.personas ?? []) fila[p.nombre] = p.semanas.find((s) => s.n === n)?.totales.vendido ?? 0;
    return fila;
  });

  async function exportar() {
    if (!data) return;
    const XLSX = await import("xlsx");
    const aoa: (string | number)[][] = [[`ARQUEO DIARIO · ${nombreMes(mes)}`], []];
    const cab = ["FECHA", ...COLUMNAS.map((c) => c.titulo.toUpperCase())];
    for (const p of data.personas) {
      aoa.push([p.nombre.toUpperCase()], cab);
      for (const s of p.semanas) {
        for (const f of s.filas) aoa.push([fechaCorta(f.fecha), ...COLUMNAS.map((c) => c.valor(f) ?? "")]);
        aoa.push([`SUBTOTAL ${nombreSemana(s.n)}`, ...COLUMNAS.map((c) => c.valor(s.totales) ?? "")]);
      }
      aoa.push([`TOTAL ${p.nombre.toUpperCase()}`, ...COLUMNAS.map((c) => c.valor(p.totales) ?? "")], []);
    }
    aoa.push(["TOTAL GENERAL", ...COLUMNAS.map((c) => c.valor(data.totales) ?? "")]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 24 }, ...COLUMNAS.map(() => ({ wch: 14 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, nombreMes(mes).slice(0, 30));
    XLSX.writeFile(wb, `arqueo-${mes}.xlsx`);
  }

  return (
    <div className="factura-imprimible w-full min-w-0 space-y-5">
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } .no-imprimir { display: none !important; } }`}</style>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav className="no-imprimir mb-1 text-xs text-slate-500">
            <Link href="/reportes" className="hover:text-[#4FAEB2]">Reportes</Link> /{" "}
            <span className="font-semibold text-slate-700">Arqueo del mes</span>
          </nav>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">ARQUEO DIARIO · {nombreMes(mes)}</h1>
          <p className="no-imprimir mt-1 text-sm text-slate-500">
            Como la planilla: cada persona con sus días, el subtotal de la semana y el total del mes.
          </p>
        </div>
        <div className="no-imprimir flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-slate-500">Mes
            <input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
          </label>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Printer className="h-4 w-4" /> Imprimir
          </button>
          <button type="button" onClick={() => void exportar()} disabled={!data} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-[#3F8E91] hover:bg-[#4FAEB2]/5 disabled:opacity-40">
            <Download className="h-4 w-4" /> Exportar Excel
          </button>
        </div>
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {cargando && !data ? <p className="py-10 text-center text-sm text-slate-400">Cargando…</p> : null}

      {data && data.personas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No hubo cajas este mes.</p>
      ) : null}

      {data && data.personas.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Cuadro titulo="Vendido (crédito y contado)" valor={`Gs. ${gs(data.totales.vendido)}`} fuerte />
            <Cuadro titulo="Contado" valor={`Gs. ${gs(data.totales.contado)}`} />
            <Cuadro titulo="Crédito" valor={`Gs. ${gs(data.totales.credito)}`} />
            <Cuadro titulo="Cobranzas" valor={`Gs. ${gs(data.totales.cobranzas + data.totales.otros)}`} />
            <Cuadro
              titulo="Diferencia del mes"
              valor={`Gs. ${gs(data.totales.diferencia)}`}
              detalle={data.totales.sin_contar > 0 ? `${data.totales.sin_contar} día(s) sin contar, no incluidos` : undefined}
              color={Math.round(data.totales.diferencia) < 0 ? "text-red-700" : undefined}
            />
          </div>

          {grafico.length > 0 ? (
            <div className="no-imprimir rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Vendido por semana</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={grafico} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => corto(v)} width={48} />
                    <Tooltip formatter={(v: number, k: string) => [`Gs. ${gs(v)}`, k]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {data.personas.map((p, i) => (
                      <Bar key={p.clave} dataKey={p.nombre} fill={COLORES[i % COLORES.length]} radius={[3, 3, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}

          {data.personas.map((p) => (
            <div key={p.clave} className="break-inside-avoid overflow-x-auto rounded-2xl border border-slate-300 bg-white shadow-sm">
              <div className="flex items-center justify-between bg-[#0B3A3D] px-4 py-2 text-white">
                <p className="text-sm font-bold uppercase tracking-wide">{p.nombre}</p>
                <p className="text-sm">Vendido: <b className="tabular-nums">Gs. {gs(p.totales.vendido)}</b></p>
              </div>
              <table className="w-full min-w-[1100px] text-xs">
                <thead className="bg-slate-100 text-[11px] uppercase text-slate-600">
                  <tr>
                    <th className="px-2 py-2 text-left">Fecha</th>
                    {COLUMNAS.map((c) => (
                      <th key={c.titulo} className="px-2 py-2 text-right" title={c.ayuda}>{c.titulo}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {p.semanas.map((s) => (
                    <Fragment key={s.n}>
                      {s.filas.map((f) => (
                        <tr key={f.caja_id} className="border-b border-slate-100">
                          <td className="px-2 py-1.5 font-medium text-slate-700">
                            {fechaCorta(f.fecha)}
                            {!f.cerrada ? <span className="ml-1 text-[10px] text-amber-600">(abierta)</span> : null}
                          </td>
                          {COLUMNAS.map((c) => (
                            <Celda key={c.titulo} titulo={c.titulo} v={c.valor(f)} pendiente={f.efectivo === null} />
                          ))}
                        </tr>
                      ))}
                      <tr className="border-b-2 border-slate-300 bg-sky-50 font-semibold text-slate-800">
                        <td className="px-2 py-1.5">Subtotal {nombreSemana(s.n).toLowerCase()}</td>
                        {COLUMNAS.map((c) => (
                          <Celda key={c.titulo} titulo={c.titulo} v={c.valor(s.totales)} />
                        ))}
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-amber-100 font-bold text-slate-900">
                    <td className="px-2 py-2">TOTAL DEL MES</td>
                    {COLUMNAS.map((c) => (
                      <Celda key={c.titulo} titulo={c.titulo} v={c.valor(p.totales)} />
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}

          <div className="overflow-x-auto rounded-2xl border-2 border-[#0B3A3D] bg-amber-50">
            <table className="w-full min-w-[1100px] text-xs">
              <thead className="text-[11px] uppercase text-slate-600">
                <tr>
                  <th className="px-2 py-2 text-left">Total general</th>
                  {COLUMNAS.map((c) => <th key={c.titulo} className="px-2 py-2 text-right">{c.titulo}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr className="text-sm font-bold text-slate-900">
                  <td className="px-2 py-2">{nombreMes(mes)}</td>
                  {COLUMNAS.map((c) => <Celda key={c.titulo} titulo={c.titulo} v={c.valor(data.totales)} />)}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="no-imprimir text-xs text-slate-500">
            Debe rendir = apertura + contado + cobranzas − gastos. Rendición total = efectivo contado + cheques +
            transferencias. Los días sin conteo de billetes no tienen diferencia (se ven en gris).
          </p>
        </>
      ) : null}
    </div>
  );
}

function Celda({ titulo, v, pendiente = false }: { titulo: string; v: number | null; pendiente?: boolean }) {
  const esDif = titulo === "Diferencia";
  const sinDato = v === null;
  const color = sinDato
    ? "text-slate-300"
    : esDif && Math.round(v) < 0
      ? "text-red-700"
      : esDif && Math.round(v) > 0
        ? "text-amber-700"
        : "";
  return (
    <td className={`px-2 py-1.5 text-right tabular-nums ${color} ${pendiente && sinDato ? "italic" : ""}`}>
      {sinDato ? (pendiente ? "sin contar" : "") : v === 0 && !esDif ? "–" : gs(v)}
    </td>
  );
}

function Cuadro({ titulo, valor, detalle, fuerte = false, color }: { titulo: string; valor: string; detalle?: string; fuerte?: boolean; color?: string }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-sm ${fuerte ? "border-[#0B3A3D] bg-[#0B3A3D] text-white" : "border-slate-200 bg-white"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${fuerte ? "text-white/70" : "text-slate-500"}`}>{titulo}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${color ?? ""}`}>{valor}</p>
      {detalle ? <p className="text-[11px] text-slate-500">{detalle}</p> : null}
    </div>
  );
}
