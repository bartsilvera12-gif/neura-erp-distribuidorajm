"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, Printer } from "lucide-react";
import { apiFetch } from "@/lib/api/fetch-with-supabase-session";
import { getProveedores } from "@/lib/proveedores/storage";
import type { Proveedor } from "@/lib/proveedores/types";
import {
  encabezadoDia,
  nombreMes,
  nombreSemana,
  numeroCorto,
  type ComprasSemanal,
} from "@/lib/reportes/compras-semanal";

/**
 * Compras por semana, como la planilla de Excel «COMPRA LA BLANCA» que usaba
 * la distribuidora: por cada semana, una columna por día con el N° de
 * factura y el monto, el TOTAL del día, el total de la semana y el
 * acumulado del mes. Arriba, los totales y los gráficos.
 */

const gs = (n: number) => Math.round(Number(n) || 0).toLocaleString("es-PY");
/** Eje de los gráficos en millones: «2.300 M». */
const corto = (n: number) => (n >= 1_000_000 ? `${Math.round(n / 1_000_000).toLocaleString("es-PY")} M` : gs(n));
const mesActual = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date()).slice(0, 7);
const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default function ComprasSemanalPage() {
  const [mes, setMes] = useState(mesActual());
  const [proveedorId, setProveedorId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [categorias, setCategorias] = useState<{ id: string; nombre: string; parent_id: string | null }[]>([]);
  const [data, setData] = useState<ComprasSemanal | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ mes });
    if (proveedorId) p.set("proveedor_id", proveedorId);
    if (categoriaId) p.set("categoria_id", categoriaId);
    return p.toString();
  }, [mes, proveedorId, categoriaId]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/reportes/compras-semanal?${qs}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) throw new Error(j?.error ?? `Error ${r.status}`);
      setData(j.data as ComprasSemanal);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el reporte.");
      setData(null);
    } finally {
      setCargando(false);
    }
  }, [qs]);

  useEffect(() => {
    getProveedores().then(setProveedores).catch(() => {});
    apiFetch("/api/inventario/categorias")
      .then((r) => r.json())
      .then((j) => setCategorias(Array.isArray(j?.data?.categorias) ? j.data.categorias : []))
      .catch(() => {});
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const nombreProveedor = proveedores.find((p) => String(p.id) === proveedorId)?.nombre ?? null;
  const nombreCategoria = categorias.find((c) => c.id === categoriaId)?.nombre ?? null;
  const titulo = `COMPRAS ${nombreProveedor ? `${nombreProveedor.toUpperCase()} · ` : ""}${nombreMes(mes)}${nombreCategoria ? ` · ${nombreCategoria.toUpperCase()}` : ""}`;

  const anterior = data && data.meses.length >= 2 ? data.meses[data.meses.length - 2] : null;
  const semanasConCompras = data?.semanas.filter((s) => s.total > 0).length ?? 0;

  async function exportar() {
    if (!data) return;
    const XLSX = await import("xlsx");
    // Misma forma que la planilla: por semana, dos columnas por día (N° | monto).
    const aoa: (string | number)[][] = [[titulo], []];
    for (const s of data.semanas) {
      const cab: (string | number)[] = [nombreSemana(s.n), s.total];
      const fila2: (string | number)[] = [];
      for (const d of s.dias) fila2.push(encabezadoDia(d.fecha), "");
      aoa.push(cab, fila2);
      const alto = Math.max(1, ...s.dias.map((d) => d.compras.length));
      for (let i = 0; i < alto; i++) {
        const fila: (string | number)[] = [];
        for (const d of s.dias) {
          const c = d.compras[i];
          fila.push(c ? numeroCorto(c.numero) : "", c ? c.total : "");
        }
        aoa.push(fila);
      }
      const tot: (string | number)[] = [];
      for (const d of s.dias) tot.push("TOTAL", d.total);
      aoa.push(tot, ["ACUMULADO DEL MES", s.acumulado], []);
    }
    aoa.push(["TOTAL DEL MES", data.total_mes]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = Array.from({ length: 14 }, (_, i) => ({ wch: i % 2 === 0 ? 12 : 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, nombreMes(mes).slice(0, 30));
    XLSX.writeFile(wb, `compras-${mes}.xlsx`);
  }

  return (
    <div className="factura-imprimible w-full min-w-0 space-y-5">
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } .no-imprimir { display: none !important; } }`}</style>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav className="no-imprimir mb-1 text-xs text-slate-500">
            <Link href="/reportes" className="hover:text-[#4FAEB2]">Reportes</Link> /{" "}
            <span className="font-semibold text-slate-700">Compras por semana</span>
          </nav>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{titulo}</h1>
          <p className="no-imprimir mt-1 text-sm text-slate-500">
            Como la planilla: por semana, cada día con sus facturas y el total. No incluye compras anuladas.
          </p>
        </div>
        <div className="no-imprimir flex gap-2">
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Printer className="h-4 w-4" /> Imprimir
          </button>
          <button type="button" onClick={() => void exportar()} disabled={!data} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-[#3F8E91] hover:bg-[#4FAEB2]/5 disabled:opacity-40">
            <Download className="h-4 w-4" /> Exportar Excel
          </button>
        </div>
      </div>

      <div className="no-imprimir grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
        <label className="text-xs font-semibold text-slate-500">Mes
          <input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs font-semibold text-slate-500">Proveedor
          <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            {proveedores.map((p) => <option key={p.id} value={String(p.id)}>{p.nombre}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-500">Categoría
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {[...categorias].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {cargando && !data ? <p className="py-10 text-center text-sm text-slate-400">Cargando…</p> : null}

      {data ? (
        <>
          {/* Totales grandes, como el pie de la planilla */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Cuadro titulo="Total del mes" valor={`Gs. ${gs(data.total_mes)}`} fuerte />
            <Cuadro titulo="Facturas" valor={String(data.cantidad)} />
            <Cuadro titulo="Promedio por semana" valor={`Gs. ${gs(semanasConCompras ? data.total_mes / semanasConCompras : 0)}`} />
            <Cuadro
              titulo={anterior ? `Mes anterior (${nombreMes(anterior.mes).toLowerCase()})` : "Mes anterior"}
              valor={anterior ? `Gs. ${gs(anterior.total)}` : "—"}
            />
          </div>

          {/* Resumen por semana: total y acumulado */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-[#0B3A3D] text-xs uppercase tracking-wide text-white">
                  <tr>
                    <th className="px-3 py-2 text-left">Semana</th>
                    <th className="px-3 py-2 text-left">Días</th>
                    <th className="px-3 py-2 text-right">Total semana</th>
                    <th className="px-3 py-2 text-right">Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.semanas.map((s) => (
                    <tr key={s.n} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-semibold text-slate-800">{nombreSemana(s.n)}</td>
                      <td className="px-3 py-2 text-slate-500">{s.desde.slice(8)}/{s.desde.slice(5, 7)} al {s.hasta.slice(8)}/{s.hasta.slice(5, 7)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{gs(s.total)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{gs(s.acumulado)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-amber-50 font-bold text-slate-900">
                    <td className="px-3 py-2" colSpan={2}>TOTAL DEL MES</td>
                    <td className="px-3 py-2 text-right tabular-nums" colSpan={2}>Gs. {gs(data.total_mes)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Grafico titulo="Por semana" datos={data.semanas.map((s) => ({ nombre: `Sem ${s.n}`, total: s.total }))} />
              <Grafico
                titulo="Últimos 12 meses"
                datos={data.meses.map((m) => ({ nombre: MESES_CORTO[Number(m.mes.slice(5, 7)) - 1], total: m.total }))}
                resaltar={data.meses.length - 1}
              />
            </div>
          </div>

          {/* Las semanas, como la planilla */}
          {data.semanas.map((s) => (
            <div key={s.n} className="break-inside-avoid overflow-x-auto rounded-2xl border border-slate-300 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 bg-[#0B3A3D] px-4 py-2 text-white">
                <p className="text-sm font-bold tracking-wide">{nombreSemana(s.n)}</p>
                <p className="text-base font-bold tabular-nums">Gs. {gs(s.total)}</p>
              </div>
              <div className="grid min-w-[900px]" style={{ gridTemplateColumns: `repeat(${s.dias.length}, minmax(0, 1fr))` }}>
                {s.dias.map((d) => (
                  <div key={d.fecha} className="flex flex-col border-r border-slate-200 last:border-r-0">
                    <p className="border-b border-slate-200 bg-slate-100 px-2 py-1.5 text-center text-xs font-bold text-slate-700">{encabezadoDia(d.fecha)}</p>
                    <div className="flex-1">
                      {d.compras.length === 0 ? (
                        <p className="px-2 py-2 text-center text-xs text-slate-300">—</p>
                      ) : (
                        d.compras.map((c) => (
                          <div key={c.id} className="flex items-baseline justify-between gap-2 border-b border-slate-100 px-2 py-1 text-xs" title={c.proveedor ?? ""}>
                            <span className="font-mono text-slate-500">{numeroCorto(c.numero)}</span>
                            <span className="tabular-nums text-slate-800">{gs(c.total)}</span>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex items-baseline justify-between gap-2 border-t-2 border-slate-300 bg-amber-50 px-2 py-1.5 text-xs font-bold">
                      <span>TOTAL</span>
                      <span className="tabular-nums">{gs(d.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="border-t border-slate-200 bg-slate-50 px-4 py-1.5 text-right text-xs text-slate-600">
                Acumulado del mes: <b className="tabular-nums text-slate-900">Gs. {gs(s.acumulado)}</b>
              </p>
            </div>
          ))}

          <div className="flex items-center justify-between rounded-2xl border-2 border-[#0B3A3D] bg-amber-50 px-5 py-3">
            <p className="text-base font-bold text-slate-900">TOTAL DEL MES · {nombreMes(mes)}</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900">Gs. {gs(data.total_mes)}</p>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Cuadro({ titulo, valor, detalle, fuerte = false }: { titulo: string; valor: string; detalle?: string; fuerte?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-sm ${fuerte ? "border-[#0B3A3D] bg-[#0B3A3D] text-white" : "border-slate-200 bg-white"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${fuerte ? "text-white/70" : "text-slate-500"}`}>{titulo}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{valor}</p>
      {detalle ? <p className="text-[11px] text-slate-500">{detalle}</p> : null}
    </div>
  );
}

function Grafico({ titulo, datos, resaltar }: { titulo: string; datos: { nombre: string; total: number }[]; resaltar?: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#E2E8F0" />
            <XAxis dataKey="nombre" tick={{ fontSize: 9 }} interval={0} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => corto(v)} width={62} />
            <Tooltip formatter={(v: number) => [`Gs. ${gs(v)}`, "Compras"]} />
            <Bar
              dataKey="total"
              radius={[4, 4, 0, 0]}
              fill="#4FAEB2"
              // La barra del mes elegido, más oscura.
              shape={resaltar === undefined ? undefined : (p: unknown) => {
                const q = p as { x: number; y: number; width: number; height: number; index: number };
                return <rect x={q.x} y={q.y} width={q.width} height={q.height} rx={4} fill={q.index === resaltar ? "#0B3A3D" : "#4FAEB2"} />;
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
