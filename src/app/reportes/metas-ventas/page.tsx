"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronLeft, ChevronRight, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import MontoInput from "@/components/ui/MontoInput";
import { nombreMes } from "@/lib/reportes/compras-semanal";
import { CLAVE_TOTAL, cuentasMeta, type MetaVentas, type MetasDelMes } from "@/lib/metas/metas-ventas";

/**
 * Metas de ventas mensuales (en guaraníes): se cargan, se cambian y se ve el
 * avance de lo vendido contra la meta. Se puede cargar por adelantado la
 * meta del mes siguiente (o de cualquier mes) eligiendo el mes arriba.
 *
 * Meta de «Total empresa» y, si se quiere, una por persona (cada camionero,
 * el salón). Solo el administrador carga y cambia; los demás miran.
 */

const gs = (n: number) => Math.round(Number(n) || 0).toLocaleString("es-PY");
const millones = (n: number) => (n >= 1_000_000 ? `${Math.round(n / 1_000_000).toLocaleString("es-PY")} M` : gs(n));
const mesActual = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date()).slice(0, 7);
function moverMes(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
const nombreBonito = (mes: string) => {
  const n = nombreMes(mes);
  return n.charAt(0) + n.slice(1).toLowerCase();
};

export default function MetasVentasPage() {
  const [mes, setMes] = useState(mesActual());
  const [data, setData] = useState<MetasDelMes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ clave: string; monto: number; nota: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const r = await fetchWithSupabaseSession(`/api/metas-ventas?mes=${mes}`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { data?: MetasDelMes; error?: string };
      if (!r.ok || !j.data) throw new Error(j.error ?? "No se pudieron cargar las metas.");
      setData(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las metas.");
    }
  }, [mes]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const esAdmin = data?.es_admin ?? false;
  const hoy = data?.hoy ?? `${mesActual()}-01`;
  const total = data?.metas.find((m) => m.clave === CLAVE_TOTAL) ?? null;
  const sinMeta = (data?.ambitos ?? []).filter((a) => !data?.metas.some((m) => m.clave === a.clave));
  const esFuturo = mes > hoy.slice(0, 7);

  async function guardar() {
    if (!editando) return;
    setGuardando(true);
    setAviso(null);
    try {
      const r = await fetchWithSupabaseSession("/api/metas-ventas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mes, clave: editando.clave, monto: editando.monto, nota: editando.nota }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo guardar la meta.");
      setEditando(null);
      setAviso(`Meta de ${nombreBonito(mes)} guardada.`);
      await cargar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo guardar la meta.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(m: MetaVentas) {
    if (!window.confirm(`¿Borrar la meta de ${m.nombre} de ${nombreBonito(mes)}?`)) return;
    const r = await fetchWithSupabaseSession(`/api/metas-ventas?id=${m.id}`, { method: "DELETE" });
    if (!r.ok) setAviso("No se pudo borrar la meta.");
    await cargar();
  }

  async function copiarDelAnterior() {
    const desde = moverMes(mes, -1);
    if (!window.confirm(`¿Copiar las metas de ${nombreBonito(desde)} a ${nombreBonito(mes)}? Las que ya estén cargadas no se cambian.`)) return;
    const r = await fetchWithSupabaseSession("/api/metas-ventas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "copiar", desde, hasta: mes }),
    });
    const j = (await r.json().catch(() => ({}))) as { data?: { copiadas?: number }; error?: string };
    setAviso(r.ok ? `Se copiaron ${j.data?.copiadas ?? 0} meta(s).` : (j.error ?? "No se pudo copiar."));
    await cargar();
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      <div>
        <nav className="mb-1 text-xs text-slate-500">
          <Link href="/reportes" className="hover:text-[#4FAEB2]">Reportes</Link> /{" "}
          <span className="font-semibold text-slate-700">Metas de ventas</span>
        </nav>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Metas de ventas</h1>
        <p className="mt-1 text-sm text-slate-500">
          La meta de ventas de cada mes y cuánto se lleva vendido. Elegí el mes con las flechas: también se puede
          cargar la meta del mes que viene.
        </p>
      </div>

      {/* Mes */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setMes(moverMes(mes, -1))} aria-label="Mes anterior" className="rounded-xl border border-slate-200 bg-white p-2.5 hover:bg-slate-50">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-48 rounded-xl border-2 border-[#0B3A3D] bg-white px-4 py-2 text-center">
          <p className="text-lg font-bold text-slate-900">{nombreBonito(mes)}</p>
          <p className="text-[11px] text-slate-500">
            {mes === hoy.slice(0, 7) ? "Mes actual" : esFuturo ? "Mes que viene · meta por adelantado" : "Mes cerrado"}
          </p>
        </div>
        <button type="button" onClick={() => setMes(moverMes(mes, 1))} aria-label="Mes siguiente" className="rounded-xl border border-slate-200 bg-white p-2.5 hover:bg-slate-50">
          <ChevronRight className="h-5 w-5" />
        </button>
        {mes !== mesActual() ? (
          <button type="button" onClick={() => setMes(mesActual())} className="rounded-xl px-3 py-2 text-sm font-medium text-[#3F8E91] hover:bg-[#4FAEB2]/10">
            Ir al mes actual
          </button>
        ) : null}
        {esAdmin ? (
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={() => void copiarDelAnterior()} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Copy className="h-4 w-4" /> Copiar del mes anterior
            </button>
            <button
              type="button"
              onClick={() => setEditando({ clave: sinMeta[0]?.clave ?? CLAVE_TOTAL, monto: 0, nota: "" })}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91]"
            >
              <Plus className="h-4 w-4" /> Cargar meta
            </button>
          </div>
        ) : null}
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {aviso ? <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">{aviso}</p> : null}
      {data && !data.disponible ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Falta correr el SQL 61 (metas de ventas).</p>
      ) : null}

      {/* Formulario */}
      {editando ? (
        <div className="rounded-2xl border-2 border-[#4FAEB2] bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-bold text-slate-900">Meta de {nombreBonito(mes)}</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
            <label className="text-xs font-semibold text-slate-500">Para
              <select
                value={editando.clave}
                onChange={(e) => setEditando({ ...editando, clave: e.target.value })}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm"
              >
                {(data?.ambitos ?? []).map((a) => (
                  <option key={a.clave} value={a.clave}>{a.nombre}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-500">Meta de ventas (Gs.)
              <MontoInput
                value={editando.monto}
                onChange={(v) => setEditando({ ...editando, monto: v })}
                decimals={false}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-right text-sm font-semibold tabular-nums"
              />
            </label>
            <label className="text-xs font-semibold text-slate-500">Nota (opcional)
              <input
                value={editando.nota}
                onChange={(e) => setEditando({ ...editando, nota: e.target.value })}
                placeholder="Ej.: incluye fiestas de fin de año"
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm"
              />
            </label>
            <div className="flex items-end gap-2">
              <button type="button" onClick={() => setEditando(null)} className="h-10 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button type="button" onClick={() => void guardar()} disabled={guardando || !(editando.monto > 0)} className="h-10 rounded-lg bg-[#4FAEB2] px-4 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-40">
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Si ya hay una meta para esa persona en este mes, se reemplaza por esta.
          </p>
        </div>
      ) : null}

      {/* Metas del mes */}
      {data && data.disponible && data.metas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No hay metas cargadas para {nombreBonito(mes)}.
          {esAdmin ? " Tocá «Cargar meta» para agregar una." : ""}
        </div>
      ) : null}

      {total ? <MetaPrincipal meta={total} hoy={hoy} esAdmin={esAdmin} onEditar={() => setEditando({ clave: total.clave, monto: total.monto, nota: total.nota ?? "" })} onBorrar={() => void borrar(total)} /> : null}

      {data && data.metas.filter((m) => m.clave !== CLAVE_TOTAL).length > 0 ? (
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-800">Por persona</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.metas
              .filter((m) => m.clave !== CLAVE_TOTAL)
              .map((m) => (
                <MetaChica
                  key={m.id}
                  meta={m}
                  hoy={hoy}
                  esAdmin={esAdmin}
                  onEditar={() => setEditando({ clave: m.clave, monto: m.monto, nota: m.nota ?? "" })}
                  onBorrar={() => void borrar(m)}
                />
              ))}
          </div>
        </div>
      ) : null}

      {/* Todos los meses con metas */}
      {data && data.meses.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <p className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">Metas cargadas</p>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Mes</th>
                <th className="px-4 py-2 text-right">Meta</th>
                <th className="px-4 py-2 text-right">Vendido</th>
                <th className="px-4 py-2 text-left">Avance</th>
              </tr>
            </thead>
            <tbody>
              {data.meses.map((r) => {
                const pct = r.meta > 0 ? (r.vendido / r.meta) * 100 : 0;
                const futuro = r.mes > hoy.slice(0, 7);
                return (
                  <tr key={r.mes} onClick={() => setMes(r.mes)} className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${r.mes === mes ? "bg-[#4FAEB2]/10" : ""}`}>
                    <td className="px-4 py-2 font-medium text-slate-800">{nombreBonito(r.mes)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">Gs. {gs(r.meta)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{futuro ? "—" : `Gs. ${gs(r.vendido)}`}</td>
                    <td className="px-4 py-2">
                      {futuro ? (
                        <span className="text-xs text-slate-400">Todavía no empezó</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Barra pct={pct} esperado={r.mes === hoy.slice(0, 7) ? (Number(hoy.slice(8, 10)) / new Date(Date.UTC(Number(r.mes.slice(0, 4)), Number(r.mes.slice(5, 7)), 0)).getUTCDate()) * 100 : 100} />
                          <span className="w-12 text-right text-xs font-semibold tabular-nums">{Math.round(pct)}%</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Color según cómo viene contra lo esperado a la fecha (`esperado`, en %):
 * cumplida verde, al día verde agua, un poco atrasada naranja, muy atrasada
 * rojo. A mitad de mes un 40% puede estar bien: no se pinta de rojo por eso.
 */
function Barra({ pct, esperado = 100, alta = false }: { pct: number; esperado?: number; alta?: boolean }) {
  const color =
    pct >= 100 ? "bg-emerald-500" : pct >= esperado ? "bg-[#4FAEB2]" : pct >= esperado * 0.85 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className={`w-full overflow-hidden rounded-full bg-slate-100 ${alta ? "h-5" : "h-2.5"}`}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

function Acciones({ esAdmin, onEditar, onBorrar }: { esAdmin: boolean; onEditar: () => void; onBorrar: () => void }) {
  if (!esAdmin) return null;
  return (
    <div className="flex gap-1">
      <button type="button" onClick={onEditar} aria-label="Cambiar meta" title="Cambiar meta" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
        <Pencil className="h-4 w-4" />
      </button>
      <button type="button" onClick={onBorrar} aria-label="Borrar meta" title="Borrar meta" className="rounded-lg p-1.5 text-red-500 hover:bg-red-50">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

/** La meta de toda la empresa, grande, con el gráfico del mes. */
function MetaPrincipal({ meta, hoy, esAdmin, onEditar, onBorrar }: { meta: MetaVentas; hoy: string; esAdmin: boolean; onEditar: () => void; onBorrar: () => void }) {
  const c = cuentasMeta(meta.monto, meta.vendido, meta.mes, hoy);
  // Acumulado por día contra la línea pareja de la meta.
  const serie = useMemo(() => {
    const diarios = Array.from({ length: c.total }, (_, i) => meta.por_dia[`${meta.mes}-${String(i + 1).padStart(2, "0")}`] ?? 0);
    const acumulados = diarios.reduce<number[]>((acc, v) => [...acc, (acc[acc.length - 1] ?? 0) + v], []);
    return acumulados.map((acum, i) => ({
      dia: i + 1,
      vendido: i < c.pasados ? acum : null,
      ritmo: Math.round((meta.monto * (i + 1)) / c.total),
    }));
  }, [meta, c.total, c.pasados]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Meta de toda la empresa</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">Gs. {gs(meta.monto)}</p>
          {meta.nota ? <p className="text-xs text-slate-500">{meta.nota}</p> : null}
        </div>
        <Acciones esAdmin={esAdmin} onEditar={onEditar} onBorrar={onBorrar} />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Barra pct={c.avance} esperado={(c.pasados / c.total) * 100} alta />
        <span className="w-16 text-right text-xl font-bold tabular-nums text-slate-900">{Math.round(c.avance)}%</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato titulo="Vendido" valor={`Gs. ${gs(meta.vendido)}`} />
        <Dato titulo={c.falta > 0 ? "Falta" : "Superada por"} valor={`Gs. ${gs(c.falta > 0 ? c.falta : meta.vendido - meta.monto)}`} color={c.falta > 0 ? undefined : "text-emerald-700"} />
        <Dato
          titulo="Hay que vender por día"
          valor={c.restantes > 0 && c.falta > 0 ? `Gs. ${gs(c.porDiaNecesario)}` : "—"}
          detalle={c.restantes > 0 ? `Quedan ${c.restantes} día(s)` : c.pasados === 0 ? "El mes todavía no empezó" : "Mes terminado"}
        />
        <Dato
          titulo="Al ritmo actual, a fin de mes"
          valor={c.pasados > 0 ? `Gs. ${gs(c.proyeccion)}` : "—"}
          detalle={c.pasados > 0 && c.restantes > 0 ? (c.alDia ? "Va al día con la meta" : "Va atrasado con la meta") : undefined}
          color={c.pasados > 0 && c.restantes > 0 ? (c.alDia ? "text-emerald-700" : "text-amber-700") : undefined}
        />
      </div>

      {c.pasados > 0 ? (
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serie} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => millones(v)} width={72} />
              <Tooltip formatter={(v: number, k: string) => [`Gs. ${gs(v)}`, k === "vendido" ? "Vendido (acumulado)" : "Para llegar a la meta"]} labelFormatter={(d) => `Día ${d}`} />
              <ReferenceLine y={meta.monto} stroke="#0B3A3D" strokeDasharray="4 4" label={{ value: "Meta", position: "insideTopLeft", fontSize: 10 }} />
              <Line type="monotone" dataKey="ritmo" stroke="#94A3B8" strokeDasharray="5 5" dot={false} />
              <Line type="monotone" dataKey="vendido" stroke="#4FAEB2" strokeWidth={3} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-1 text-center text-[11px] text-slate-500">
            Línea verde: lo vendido acumulado. Línea gris: lo que habría que llevar para llegar a la meta vendiendo parejo.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function MetaChica({ meta, hoy, esAdmin, onEditar, onBorrar }: { meta: MetaVentas; hoy: string; esAdmin: boolean; onEditar: () => void; onBorrar: () => void }) {
  const c = cuentasMeta(meta.monto, meta.vendido, meta.mes, hoy);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold uppercase text-slate-900">{meta.nombre}</p>
          <p className="text-xs text-slate-500">Meta: Gs. {gs(meta.monto)}</p>
        </div>
        <Acciones esAdmin={esAdmin} onEditar={onEditar} onBorrar={onBorrar} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Barra pct={c.avance} esperado={(c.pasados / c.total) * 100} />
        <span className="w-12 text-right text-sm font-bold tabular-nums">{Math.round(c.avance)}%</span>
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-600">
        <span>Vendido: <b className="tabular-nums">Gs. {gs(meta.vendido)}</b></span>
        <span>{c.falta > 0 ? <>Falta: <b className="tabular-nums">Gs. {gs(c.falta)}</b></> : <b className="text-emerald-700">¡Meta cumplida!</b>}</span>
      </div>
    </div>
  );
}

function Dato({ titulo, valor, detalle, color }: { titulo: string; valor: string; detalle?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${color ?? "text-slate-900"}`}>{valor}</p>
      {detalle ? <p className={`text-[11px] ${color ?? "text-slate-500"}`}>{detalle}</p> : null}
    </div>
  );
}
