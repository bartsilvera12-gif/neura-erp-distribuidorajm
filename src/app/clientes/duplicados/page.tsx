"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSWRConfig } from "swr";
import { CheckCircle2, Merge, RefreshCw } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/**
 * Clientes duplicados: el mismo cliente cargado más de una vez (una en el
 * salón con la cédula y otra en el camión con el RUC, por ejemplo). Se elige
 * con cuál quedarse y se unifican: sus ventas, facturas, recibos y cobros
 * pasan a ese cliente, y los demás se dan de baja. Queda un solo historial.
 */

type Cliente = {
  id: string;
  nombre: string;
  ruc: string | null;
  documento: string | null;
  telefono: string | null;
  direccion: string | null;
  creado: string | null;
  ventas: number;
};
type Grupo = { motivo: "documento" | "nombre"; valor: string; clientes: Cliente[] };

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-PY", { timeZone: "America/Asuncion" }) : "—");

export default function ClientesDuplicadosPage() {
  const { mutate } = useSWRConfig();
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Por grupo: cuál queda (por defecto el que tiene más ventas) y cuáles se unifican.
  const [queda, setQueda] = useState<Record<string, string>>({});
  const [incluir, setIncluir] = useState<Record<string, boolean>>({});
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const r = await fetchWithSupabaseSession("/api/clientes/duplicados", { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { data?: { grupos?: Grupo[] }; error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudieron buscar los duplicados.");
      const g = j.data?.grupos ?? [];
      setGrupos(g);
      setQueda(Object.fromEntries(g.map((x) => [clave(x), x.clientes[0].id])));
      setIncluir(Object.fromEntries(g.flatMap((x) => x.clientes.map((c) => [c.id, x.motivo === "documento"]))));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron buscar los duplicados.");
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function unificar(g: Grupo) {
    const k = clave(g);
    const conservar = queda[k];
    const duplicados = g.clientes.filter((c) => c.id !== conservar && incluir[c.id]).map((c) => c.id);
    const principal = g.clientes.find((c) => c.id === conservar);
    if (!principal || duplicados.length === 0) {
      setAviso("Marcá al menos un cliente para unificar con el que queda.");
      return;
    }
    if (
      !window.confirm(
        `¿Unificar ${duplicados.length} cliente(s) en «${principal.nombre}»? Sus ventas, facturas, recibos y cobros pasan a este cliente y los duplicados se dan de baja. No se puede deshacer.`
      )
    )
      return;
    setTrabajando(k);
    setAviso(null);
    try {
      const r = await fetchWithSupabaseSession("/api/clientes/duplicados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conservar, duplicados }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudieron unificar.");
      setAviso(`Listo: «${principal.nombre}» quedó con todo su historial.`);
      // La lista de clientes de la caja y de Clientes se vuelve a leer.
      void mutate((key) => typeof key === "string" && key.startsWith("clientes:"));
      await cargar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudieron unificar.");
    } finally {
      setTrabajando(null);
    }
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav className="mb-1 text-xs text-slate-500">
            <Link href="/clientes" className="hover:text-[#4FAEB2]">Clientes</Link> /{" "}
            <span className="font-semibold text-slate-700">Duplicados</span>
          </nav>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Clientes duplicados</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Clientes que parecen el mismo: misma cédula o RUC (1234567 y 1234567-8 son la misma persona) o el mismo
            nombre. Elegí con cuál quedarte y tocá «Unificar»: las ventas, facturas, recibos y cobros de los otros
            pasan a ese cliente, y los otros se dan de baja. Así el salón y los camiones ven al mismo cliente, con un
            solo historial.
          </p>
        </div>
        <button type="button" onClick={() => void cargar()} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" /> Volver a buscar
        </button>
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {aviso ? <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">{aviso}</p> : null}
      {!grupos && !error ? <p className="py-10 text-center text-sm text-slate-400">Buscando…</p> : null}
      {grupos && grupos.length === 0 ? (
        <p className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 p-8 text-sm text-slate-600">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" /> No hay clientes duplicados.
        </p>
      ) : null}

      {(grupos ?? []).map((g) => {
        const k = clave(g);
        return (
          <div key={k} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <p className="text-sm text-slate-700">
                {g.motivo === "documento" ? (
                  <>Misma cédula / RUC: <b className="font-mono">{g.valor}</b></>
                ) : (
                  <>Mismo nombre: <b>{g.valor}</b> <span className="text-xs text-slate-500">(revisá que sean la misma persona)</span></>
                )}
              </p>
              <button
                type="button"
                onClick={() => void unificar(g)}
                disabled={trabajando !== null}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#4FAEB2] px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-40"
              >
                <Merge className="h-4 w-4" /> {trabajando === k ? "Unificando…" : "Unificar"}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Queda</th>
                    <th className="px-4 py-2">Unificar</th>
                    <th className="px-4 py-2">Cliente</th>
                    <th className="px-4 py-2">RUC / cédula</th>
                    <th className="px-4 py-2">Teléfono / dirección</th>
                    <th className="px-4 py-2 text-right">Ventas</th>
                    <th className="px-4 py-2">Alta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {g.clientes.map((c) => {
                    const esQueda = queda[k] === c.id;
                    return (
                      <tr key={c.id} className={esQueda ? "bg-emerald-50/60" : ""}>
                        <td className="px-4 py-2">
                          <input
                            type="radio"
                            name={`queda-${k}`}
                            checked={esQueda}
                            onChange={() => setQueda({ ...queda, [k]: c.id })}
                            aria-label={`Quedarse con ${c.nombre}`}
                            className="h-4 w-4 accent-emerald-600"
                          />
                        </td>
                        <td className="px-4 py-2">
                          {esQueda ? (
                            <span className="text-xs font-semibold text-emerald-700">Queda</span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={!!incluir[c.id]}
                              onChange={(e) => setIncluir({ ...incluir, [c.id]: e.target.checked })}
                              aria-label={`Unificar ${c.nombre}`}
                              className="h-4 w-4 accent-[#4FAEB2]"
                            />
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <Link href={`/clientes/${c.id}`} className="font-medium text-slate-900 hover:text-[#3F8E91]">{c.nombre}</Link>
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-700">
                          {[c.ruc, c.documento && c.documento !== c.ruc ? c.documento : null].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-600">
                          {[c.telefono, c.direccion].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{c.ventas}</td>
                        <td className="px-4 py-2 text-xs text-slate-500">{fecha(c.creado)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function clave(g: Grupo) {
  return `${g.motivo}:${g.valor}`;
}
