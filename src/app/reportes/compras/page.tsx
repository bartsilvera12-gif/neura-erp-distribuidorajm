"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/fetch-with-supabase-session";
import { getProveedores } from "@/lib/proveedores/storage";
import type { Proveedor } from "@/lib/proveedores/types";
import { FechaSelect } from "@/components/ui/FechaSelect";

interface Fila {
  id: string;
  fecha: string | null;
  proveedor: string | null;
  proveedor_id: string | null;
  ruc: string | null;
  numero: string | null;
  condicion: string | null;
  estado: string | null;
  items: number;
  total: number;
  vencimiento: string | null;
  estado_pago: "pagada" | "pendiente" | "vencida";
}
interface CorteProveedor {
  proveedor: string;
  proveedor_id: string | null;
  compras: number;
  total: number;
}
interface Reporte {
  desde: string;
  hasta: string;
  disponible: boolean;
  resumen: { compras: number; total: number; contado: number; credito: number };
  por_proveedor: CorteProveedor[];
  filas: Fila[];
}

const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString("es-PY");

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const ESTADO_PAGO: Record<Fila["estado_pago"], { t: string; c: string }> = {
  pagada: { t: "Pagada", c: "bg-emerald-50 text-emerald-700" },
  pendiente: { t: "Pendiente", c: "bg-amber-50 text-amber-700" },
  vencida: { t: "Vencida", c: "bg-red-50 text-red-700" },
};
/** "2026-11-02" → "lunes 02/11/2026" (sin pasar por zona horaria). */
function fechaLarga(iso: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return "—";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${DIAS[d.getUTCDay()]} ${m[3]}/${m[2]}/${m[1]}`;
}
/** Lunes de la semana de una fecha (AAAA-MM-DD). */
function lunesDe(iso: string): string {
  const [y, mo, da] = iso.slice(0, 10).split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1, da));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function sumaDias(iso: string, n: number): string {
  const [y, mo, da] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, da + n)).toISOString().slice(0, 10);
}
function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ReporteComprasPage() {
  const [desde, setDesde] = useState(firstOfMonth());
  const [hasta, setHasta] = useState(today());
  const [proveedorId, setProveedorId] = useState("");
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [categoriaId, setCategoriaId] = useState("");
  const [categorias, setCategorias] = useState<{ id: string; nombre: string; parent_id: string | null }[]>([]);

  const [data, setData] = useState<Reporte | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (desde) p.set("desde", desde);
    if (hasta) p.set("hasta", hasta);
    if (proveedorId) p.set("proveedor_id", proveedorId);
    if (categoriaId) p.set("categoria_id", categoriaId);
    return p.toString();
  }, [desde, hasta, proveedorId, categoriaId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/reportes/compras?${qs}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) {
        setError(j?.error ?? `Error ${r.status}`);
        setData(null);
        return;
      }
      setData(j.data as Reporte);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    getProveedores().then(setProveedores).catch(() => {});
    apiFetch("/api/inventario/categorias")
      .then((r) => r.json())
      .then((j) => setCategorias(Array.isArray(j?.data?.categorias) ? j.data.categorias : []))
      .catch(() => {});
  }, []);

  // Categorías con sus subcategorías debajo (sangradas), para elegir un sector
  // entero (p. ej. Carnicería) o una parte.
  const opcionesCategoria = useMemo(() => {
    const hijos = new Map<string | null, typeof categorias>();
    for (const c of categorias) {
      const k = c.parent_id && categorias.some((x) => x.id === c.parent_id) ? c.parent_id : null;
      hijos.set(k, [...(hijos.get(k) ?? []), c]);
    }
    const out: { id: string; nombre: string; nivel: number }[] = [];
    const recorrer = (padre: string | null, nivel: number) => {
      for (const c of (hijos.get(padre) ?? []).sort((a, b) => a.nombre.localeCompare(b.nombre))) {
        out.push({ id: c.id, nombre: c.nombre, nivel });
        if (nivel < 5) recorrer(c.id, nivel + 1);
      }
    };
    recorrer(null, 0);
    return out;
  }, [categorias]);
  const nombreCategoria = opcionesCategoria.find((c) => c.id === categoriaId)?.nombre ?? null;
  useEffect(() => {
    load();
  }, [load]);

  const resumen = data?.resumen;
  const filas = data?.filas ?? [];
  const porProveedor = data?.por_proveedor ?? [];

  // Semanas (lunes a domingo) por fecha de compra, de la más reciente a la más antigua.
  const semanas = useMemo(() => {
    const m = new Map<string, Fila[]>();
    for (const f of filas) {
      const k = lunesDe((f.fecha ?? "").slice(0, 10) || "1970-01-01");
      m.set(k, [...(m.get(k) ?? []), f]);
    }
    return [...m.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([lunes, items]) => ({
        lunes,
        items,
        total: items.reduce((s, x) => s + x.total, 0),
      }));
  }, [filas]);

  return (
    <div className="w-full min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav className="mb-1 text-xs text-slate-500">
            <Link href="/reportes" className="hover:text-[#4FAEB2]">Reportes</Link> /{" "}
            <span className="font-semibold text-slate-700">Compras</span>
          </nav>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reporte de Compras</h1>
          <p className="mt-1 text-sm text-slate-500">
            Todas las compras del período (con o sin timbrado), con filtro por proveedor, totales y
            corte por proveedor. No incluye anuladas. Para el registro fiscal (IVA), usá el{" "}
            <Link href="/reportes/libro-compras" className="text-[#3F8E91] underline">Libro de Compras</Link>.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-5">
        <label className="text-xs font-semibold text-slate-500">Desde
          <FechaSelect value={desde} onChange={(e) => setDesde(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs font-semibold text-slate-500">Hasta
          <FechaSelect value={hasta} onChange={(e) => setHasta(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
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
            {opcionesCategoria.map((c) => (
              <option key={c.id} value={c.id}>{`${"\u00A0\u00A0".repeat(c.nivel)}${c.nombre}`}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button onClick={load} className="w-full rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91]">Aplicar</button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {nombreCategoria ? (
        <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          Mostrando solo lo comprado de <b>{nombreCategoria}</b> (y sus subcategorías): los ítems y el total de cada
          compra son los de esa categoría, no los de la factura entera.
        </p>
      ) : null}

      {resumen && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: "Compras", v: resumen.compras.toLocaleString("es-PY") },
            { k: "Total", v: `Gs. ${fmt(resumen.total)}` },
            { k: "Contado", v: `Gs. ${fmt(resumen.contado)}` },
            { k: "Crédito", v: `Gs. ${fmt(resumen.credito)}` },
          ].map((s) => (
            <div key={s.k} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{s.k}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{s.v}</p>
            </div>
          ))}
        </div>
      )}

      {porProveedor.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Por proveedor
          </div>
          <table className="w-full min-w-[420px] text-xs">
            <thead className="border-b bg-slate-50 uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-2 text-left">Proveedor</th>
                <th className="px-2 py-2 text-right">Compras</th>
                <th className="px-2 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {porProveedor.map((p, i) => (
                <tr key={p.proveedor_id ?? `n${i}`} className="border-b last:border-0 hover:bg-slate-50/60">
                  <td className="px-2 py-1.5">{p.proveedor}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.compras}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{fmt(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-xs">
          <thead className="border-b bg-slate-50 uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left">Compra</th>
              <th className="px-2 py-2 text-left">Vencimiento</th>
              <th className="px-2 py-2 text-left">Proveedor</th>
              <th className="px-2 py-2 text-left">Factura</th>
              <th className="px-2 py-2 text-left">Cond.</th>
              <th className="px-2 py-2 text-right">Ítems</th>
              <th className="px-2 py-2 text-right">Importe</th>
              <th className="px-2 py-2 text-center">Estado del pago</th>
            </tr>
          </thead>
          {loading ? (
            <tbody><tr><td colSpan={8} className="px-2 py-8 text-center text-slate-400">Cargando…</td></tr></tbody>
          ) : filas.length === 0 ? (
            <tbody><tr><td colSpan={8} className="px-2 py-8 text-center text-slate-400">Sin compras en el período/filtros.</td></tr></tbody>
          ) : semanas.map((s) => (
            <tbody key={s.lunes}>
              <tr className="border-b bg-slate-100 font-semibold text-slate-700">
                <td className="px-2 py-1.5" colSpan={6}>
                  Semana del {ddmm(s.lunes)} al {ddmm(sumaDias(s.lunes, 6))} · {s.items.length} compras
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(s.total)}</td>
                <td />
              </tr>
              {s.items.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50/60">
                  <td className="px-2 py-1.5 whitespace-nowrap">{fechaLarga(r.fecha)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{fechaLarga(r.vencimiento)}</td>
                  <td className="px-2 py-1.5">{r.proveedor ?? "—"}</td>
                  <td className="px-2 py-1.5 font-mono">{r.numero ?? "—"}</td>
                  <td className="px-2 py-1.5">{r.condicion ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.items}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{fmt(r.total)}</td>
                  <td className="px-2 py-1.5 text-center">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${ESTADO_PAGO[r.estado_pago].c}`}>
                      {ESTADO_PAGO[r.estado_pago].t}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
          {resumen && filas.length > 0 && (
            <tfoot className="border-t bg-slate-50 font-semibold text-slate-800">
              <tr>
                <td className="px-2 py-2" colSpan={6}>TOTAL ({resumen.compras} compras)</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmt(resumen.total)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
