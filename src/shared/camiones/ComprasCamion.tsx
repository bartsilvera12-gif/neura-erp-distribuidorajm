"use client";

import { useState } from "react";
import useSWR from "swr";
import { ChevronDown, ChevronRight } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Renglon = {
  codigo: string | null;
  producto: string;
  cantidad: number;
  ingresada: number;
  costo_unitario: number;
  total: number;
};
type Compra = {
  id: string;
  fecha: string;
  numero: string;
  proveedor: string;
  total: number;
  estado: string | null;
  relacion: "destino" | "transporte";
  renglones: Renglon[];
};

function hoy(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
}
function haceDias(n: number): string {
  const d = new Date(`${hoy()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-PY", {
    timeZone: "America/Asuncion",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString("es-PY")}`;
const cant = (n: number) => n.toLocaleString("es-PY", { maximumFractionDigits: 3 });

/**
 * Compras del camión: cada factura que se le cargó (o que el camión trajo al
 * salón), con fecha, número, proveedor y total. Al tocarla se despliegan sus
 * productos.
 */
export default function ComprasCamion({ camionId, version }: { camionId: string; version: number }) {
  const [periodo, setPeriodo] = useState<"hoy" | "7" | "30" | "90">("30");
  const [abierta, setAbierta] = useState<string | null>(null);
  const desde = periodo === "hoy" ? hoy() : haceDias(Number(periodo) - 1);

  const { data, error, isLoading } = useSWR<Compra[]>(
    ["camion-compras", camionId, desde, version],
    async () => {
      const res = await fetchWithSupabaseSession(`/api/camiones/${camionId}/compras?desde=${desde}`);
      const j = (await res.json().catch(() => ({}))) as { data?: Compra[]; error?: string };
      if (!res.ok || !j.data) throw new Error(j.error ?? "No se pudieron leer las compras del camión.");
      return j.data;
    },
    { revalidateOnFocus: true, keepPreviousData: true }
  );
  const compras = data ?? [];
  const total = compras.filter((c) => c.estado !== "anulada").reduce((s, c) => s + c.total, 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value as typeof periodo)}
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm"
          aria-label="Período"
        >
          <option value="hoy">Hoy</option>
          <option value="7">Últimos 7 días</option>
          <option value="30">Últimos 30 días</option>
          <option value="90">Últimos 90 días</option>
        </select>
        {compras.length > 0 ? (
          <p className="ml-auto text-sm text-slate-500">
            {compras.length} {compras.length === 1 ? "compra" : "compras"} · <b className="text-slate-800">{gs(total)}</b>
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{(error as Error).message}</p>
      ) : isLoading && !data ? (
        <p className="py-6 text-sm text-slate-400">Cargando compras…</p>
      ) : compras.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">
          No hay compras de este camión en el período.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="grid grid-cols-[24px_150px_minmax(0,1fr)_minmax(0,1.4fr)_130px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <span />
            <span>Fecha</span>
            <span>N° factura</span>
            <span>Proveedor</span>
            <span className="text-right">Total</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {compras.map((c) => {
              const ab = abierta === c.id;
              const anulada = c.estado === "anulada";
              const pendiente = c.renglones.some((r) => r.cantidad - r.ingresada > 1e-9);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setAbierta(ab ? null : c.id)}
                    aria-expanded={ab}
                    className={`grid w-full grid-cols-[24px_150px_minmax(0,1fr)_minmax(0,1.4fr)_130px] items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50 ${
                      ab ? "bg-slate-50" : ""
                    } ${anulada ? "text-slate-400 line-through" : "text-slate-800"}`}
                  >
                    {ab ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                    <span className="tabular-nums text-slate-500">{fechaHora(c.fecha)}</span>
                    <span className="truncate font-mono text-xs">
                      {c.numero}
                      {anulada ? <span className="ml-2 font-sans text-[11px] font-semibold text-red-600 no-underline">Anulada</span> : null}
                      {pendiente && !anulada ? (
                        <span className="ml-2 rounded-full bg-amber-50 px-1.5 font-sans text-[11px] font-semibold text-amber-700">
                          Pendiente
                        </span>
                      ) : null}
                    </span>
                    <span className="truncate font-medium">
                      {c.proveedor}
                      {c.relacion === "transporte" ? (
                        <span className="ml-2 text-[11px] font-normal text-slate-400">(la trajo al salón)</span>
                      ) : null}
                    </span>
                    <span className="text-right font-semibold tabular-nums">{gs(c.total)}</span>
                  </button>
                  {ab ? (
                    <div className="border-t border-slate-100 bg-slate-50/60 px-3 pb-3 pt-1">
                      <table className="w-full whitespace-nowrap text-sm">
                        <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="py-1.5 pl-8 pr-2">Código</th>
                            <th className="px-2 py-1.5">Producto</th>
                            <th className="px-2 py-1.5 text-right">Cantidad</th>
                            <th className="px-2 py-1.5 text-right">Ingresada</th>
                            <th className="px-2 py-1.5 text-right">Costo unit.</th>
                            <th className="px-2 py-1.5 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {c.renglones.map((r, i) => (
                            <tr key={i} className="text-slate-700">
                              <td className="py-1.5 pl-8 pr-2 tabular-nums text-slate-400">{r.codigo ?? "—"}</td>
                              <td className="max-w-80 truncate px-2 py-1.5">{r.producto}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{cant(r.cantidad)}</td>
                              <td
                                className={`px-2 py-1.5 text-right tabular-nums ${
                                  r.cantidad - r.ingresada > 1e-9 ? "font-semibold text-amber-600" : ""
                                }`}
                              >
                                {cant(r.ingresada)}
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{gs(r.costo_unitario)}</td>
                              <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{gs(r.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
