"use client";

import { useState } from "react";
import useSWR from "swr";
import { ChevronDown, ChevronRight } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type Renglon = { codigo: string | null; producto: string; cantidad: number; precio: number; total: number };
type Venta = {
  id: string;
  fecha: string;
  numero: string;
  cliente: string;
  vendedor: string | null;
  total: number;
  estado: string | null;
  tipo_venta: string | null;
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
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString("es-PY")}`;
const cant = (n: number) => n.toLocaleString("es-PY", { maximumFractionDigits: 3 });

/**
 * Ventas del camión: cada venta hecha desde el camión con fecha, número,
 * cliente y total. Al tocarla se despliegan sus productos con cantidad e
 * importe. Pensado para pantallas chicas (tablet y celular) y para PC.
 */
export default function VentasCamion({ camionId, version }: { camionId: string; version: number }) {
  const [periodo, setPeriodo] = useState<"hoy" | "7" | "30">("hoy");
  const [abierta, setAbierta] = useState<string | null>(null);
  const desde = periodo === "hoy" ? hoy() : haceDias(Number(periodo) - 1);

  const { data, error, isLoading } = useSWR<Venta[]>(
    ["camion-ventas", camionId, desde, version],
    async () => {
      const res = await fetchWithSupabaseSession(`/api/camiones/${camionId}/ventas?desde=${desde}`);
      const j = (await res.json().catch(() => ({}))) as { data?: Venta[]; error?: string };
      if (!res.ok || !j.data) throw new Error(j.error ?? "No se pudieron leer las ventas del camión.");
      return j.data;
    },
    { revalidateOnFocus: true, keepPreviousData: true }
  );
  const ventas = data ?? [];
  const validas = ventas.filter((v) => v.estado !== "anulada");
  const total = validas.reduce((s, v) => s + v.total, 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value as typeof periodo)}
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm"
          aria-label="Período de ventas"
        >
          <option value="hoy">Hoy</option>
          <option value="7">Últimos 7 días</option>
          <option value="30">Últimos 30 días</option>
        </select>
        {validas.length > 0 ? (
          <p className="ml-auto text-sm text-slate-500">
            {validas.length} {validas.length === 1 ? "venta" : "ventas"} · <b className="text-slate-800">{gs(total)}</b>
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{(error as Error).message}</p>
      ) : isLoading && !data ? (
        <p className="py-6 text-sm text-slate-400">Cargando ventas…</p>
      ) : ventas.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">
          Este camión no tiene ventas en el período.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {ventas.map((v) => {
            const ab = abierta === v.id;
            const anulada = v.estado === "anulada";
            return (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => setAbierta(ab ? null : v.id)}
                  aria-expanded={ab}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50 ${
                    ab ? "bg-slate-50" : ""
                  } ${anulada ? "text-slate-400 line-through" : "text-slate-800"}`}
                >
                  {ab ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{v.cliente}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {fechaHora(v.fecha)} · {v.numero}
                      {v.vendedor ? ` · ${v.vendedor}` : ""}
                      {anulada ? " · Anulada" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{gs(v.total)}</span>
                </button>
                {ab ? (
                  <div className="overflow-x-auto border-t border-slate-100 bg-slate-50/60 px-3 pb-3 pt-1">
                    <table className="w-full whitespace-nowrap text-sm">
                      <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="py-1.5 pr-2">Producto</th>
                          <th className="px-2 py-1.5 text-right">Cantidad</th>
                          <th className="px-2 py-1.5 text-right">Precio</th>
                          <th className="px-2 py-1.5 text-right">Importe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {v.renglones.map((r, i) => (
                          <tr key={i} className="text-slate-700">
                            <td className="max-w-56 truncate py-1.5 pr-2">{r.producto}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{cant(r.cantidad)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{gs(r.precio)}</td>
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
      )}
    </div>
  );
}
