"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Printer } from "lucide-react";
import { apiFetch } from "@/lib/api/fetch-with-supabase-session";
import TablaDescuentos from "@/shared/ventas/TablaDescuentos";
import { totalesDescuentos, type VentaConDescuento } from "@/lib/ventas/descuentos-reporte";

/**
 * Reportes → Descuentos: todas las ventas con descuento del período, para
 * controlarlas: a quién, qué venta, cuánto era, cuánto se descontó, cuánto se
 * cobró y quién lo aplicó. Con totales por persona.
 */

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
const gs = (v: number) => `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
const INPUT = "mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm";

export default function DescuentosPage() {
  const [desde, setDesde] = useState(`${hoy().slice(0, 8)}01`);
  const [hasta, setHasta] = useState(hoy());
  const [q, setQ] = useState("");
  const [filas, setFilas] = useState<VentaConDescuento[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/reportes/descuentos?desde=${desde}&hasta=${hasta}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) throw new Error(j?.error ?? `Error ${r.status}`);
      setFilas((j.data?.descuentos ?? []) as VentaConDescuento[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el reporte.");
      setFilas(null);
    } finally {
      setCargando(false);
    }
  }, [desde, hasta]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return filas ?? [];
    return (filas ?? []).filter((d) =>
      [d.cliente, d.ruc, d.numero_venta, d.factura, d.usuario].some((x) => (x ?? "").toLowerCase().includes(t))
    );
  }, [filas, q]);
  const tot = totalesDescuentos(visibles);

  // Por persona: cuántos descuentos dio y cuánto descontó.
  const porUsuario = useMemo(() => {
    const m = new Map<string, { cantidad: number; monto: number }>();
    for (const d of visibles) {
      const k = d.usuario ?? "Sin dato";
      const x = m.get(k) ?? { cantidad: 0, monto: 0 };
      x.cantidad += 1;
      x.monto += d.monto;
      m.set(k, x);
    }
    return [...m.entries()].sort((a, b) => b[1].monto - a[1].monto);
  }, [visibles]);

  async function exportar() {
    const XLSX = await import("xlsx");
    const aoa: (string | number)[][] = [
      [`DESCUENTOS · ${desde} al ${hasta}`],
      [],
      ["FECHA", "VENTA", "FACTURA", "CLIENTE", "RUC/CI", "CONDICIÓN", "ORIGINAL", "%", "DESCUENTO", "COBRADO", "APLICÓ", "CAJA"],
      ...visibles.map((d) => [
        new Date(d.fecha).toLocaleString("es-PY", { timeZone: "America/Asuncion", hour12: false }),
        d.numero_venta,
        d.factura ?? "",
        d.cliente,
        d.ruc ?? "",
        d.tipo_venta === "CREDITO" ? "Crédito" : "Contado",
        Math.round(d.original),
        d.porcentaje,
        Math.round(d.monto),
        Math.round(d.cobrado),
        d.usuario ?? "",
        d.caja_numero ?? "",
      ]),
      [],
      ["TOTAL", "", "", "", "", "", Math.round(tot.original), "", Math.round(tot.monto), Math.round(tot.cobrado)],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [16, 12, 16, 28, 12, 10, 12, 6, 12, 12, 20, 6].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Descuentos");
    XLSX.writeFile(wb, `descuentos-${desde}-a-${hasta}.xlsx`);
  }

  return (
    <div className="factura-imprimible w-full min-w-0 space-y-5">
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } .no-imprimir { display: none !important; } }`}</style>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav className="no-imprimir mb-1 text-xs text-slate-500">
            <Link href="/reportes" className="hover:text-[#4FAEB2]">Reportes</Link> /{" "}
            <span className="font-semibold text-slate-700">Descuentos</span>
          </nav>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Descuentos en ventas</h1>
          <p className="no-imprimir mt-1 text-sm text-slate-500">
            Cada venta con descuento: cliente, venta o factura, importe original, % y monto, lo cobrado y quién lo aplicó.
          </p>
        </div>
        <div className="no-imprimir flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-slate-500">Desde
            <input type="date" value={desde} onChange={(e) => e.target.value && setDesde(e.target.value)} className={INPUT} />
          </label>
          <label className="text-xs font-semibold text-slate-500">Hasta
            <input type="date" value={hasta} onChange={(e) => e.target.value && setHasta(e.target.value)} className={INPUT} />
          </label>
          <label className="text-xs font-semibold text-slate-500">Buscar
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cliente, venta, vendedor…" className={`${INPUT} w-48`} />
          </label>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Printer className="h-4 w-4" /> Imprimir
          </button>
          <button type="button" onClick={() => void exportar()} disabled={!visibles.length} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-[#3F8E91] hover:bg-[#4FAEB2]/5 disabled:opacity-40">
            <Download className="h-4 w-4" /> Exportar Excel
          </button>
        </div>
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {cargando && !filas ? <p className="py-10 text-center text-sm text-slate-400">Cargando…</p> : null}

      {filas ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Cuadro titulo="Ventas con descuento" valor={String(tot.cantidad)} />
            <Cuadro titulo="Importe original" valor={gs(tot.original)} />
            <Cuadro titulo="Total descontado" valor={gs(tot.monto)} resaltar />
            <Cuadro titulo="Total cobrado" valor={gs(tot.cobrado)} />
          </div>

          {porUsuario.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Por quién aplicó el descuento</p>
              <div className="flex flex-wrap gap-2">
                {porUsuario.map(([u, x]) => (
                  <span key={u} className="rounded-lg bg-slate-50 px-3 py-1.5 text-sm text-slate-700">
                    <b>{u}</b> · {x.cantidad} {x.cantidad === 1 ? "venta" : "ventas"} · <span className="text-rose-600">−{gs(x.monto)}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <TablaDescuentos filas={visibles} titulo="Ventas con descuento" conCaja vacio="No hubo descuentos en este período." />
        </>
      ) : null}
    </div>
  );
}

function Cuadro({ titulo, valor, resaltar }: { titulo: string; valor: string; resaltar?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${resaltar ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${resaltar ? "text-amber-900" : "text-slate-900"}`}>{valor}</p>
    </div>
  );
}
