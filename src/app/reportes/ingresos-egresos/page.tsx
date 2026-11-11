"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Pencil, X } from "lucide-react";
import { apiFetch } from "@/lib/api/fetch-with-supabase-session";
import { FechaSelect } from "@/components/ui/FechaSelect";
import { useIsAdmin } from "@/lib/auth/use-is-admin";

type Mov = {
  id: string;
  dia: string;
  tipo: "ingreso" | "egreso" | "retiro" | "ajuste";
  concepto: string;
  monto: number;
  medio_pago: string | null;
  categoria: string | null;
  usuario_email: string | null;
  manual: boolean;
};

type Reporte = {
  desde: string;
  hasta: string;
  disponible: boolean;
  resumen: { ingresos: number; egresos: number; diferencia: number; movimientos: number };
  por_dia: { dia: string; ingresos: number; egresos: number }[];
  ingresos: Mov[];
  egresos: Mov[];
};

const gs = (n: number) => `Gs. ${Math.round(Number(n) || 0).toLocaleString("es-PY")}`;
const dia = (s: string) => {
  const [y, m, d] = String(s).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

/** Hoy en Asunción (YYYY-MM-DD). */
function hoyAsuncion(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Asuncion", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function primeroDelMesAsuncion(): string {
  const [y, m] = hoyAsuncion().split("-");
  return `${y}-${m}-01`;
}
function hace7Dias(): string {
  const [y, m, d] = hoyAsuncion().split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() - 6);
  const dd = (n: number) => String(n).padStart(2, "0");
  return `${base.getUTCFullYear()}-${dd(base.getUTCMonth() + 1)}-${dd(base.getUTCDate())}`;
}

const CARD = "rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm";

export default function ReporteIngresosEgresosPage() {
  const [desde, setDesde] = useState(primeroDelMesAsuncion());
  const [hasta, setHasta] = useState(hoyAsuncion());
  const [data, setData] = useState<Reporte | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Mov | null>(null);
  const { isAdmin: esAdmin } = useIsAdmin();

  const aplicarPreset = useCallback((preset: "dia" | "semana" | "mes") => {
    const hoy = hoyAsuncion();
    if (preset === "dia") { setDesde(hoy); setHasta(hoy); }
    else if (preset === "semana") { setDesde(hace7Dias()); setHasta(hoy); }
    else { setDesde(primeroDelMesAsuncion()); setHasta(hoy); }
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const r = await apiFetch(`/api/reportes/ingresos-egresos?desde=${desde}&hasta=${hasta}`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string; data?: Reporte };
      if (!r.ok || !j.success || !j.data) {
        setError(j.error ?? `Error ${r.status}`); setData(null); return;
      }
      setData(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally { setCargando(false); }
  }, [desde, hasta]);

  useEffect(() => { void cargar(); }, [cargar]);

  const diaDe = (iso: string) => dia(iso);

  return (
    <div className="w-full min-w-0 space-y-5">
      <Link href="/reportes" className="inline-flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-slate-600">
        ← Volver a Reportes
      </Link>

      <div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Reportes · Caja</p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Ingresos y Egresos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Movimientos de caja del período — a la izquierda lo que entró, a la derecha lo que salió.
        </p>
      </div>

      {/* Filtros + presets día / semana / mes */}
      <div className={`${CARD} flex flex-wrap items-end gap-3`}>
        <div className="flex gap-2">
          <PresetButton label="Hoy" onClick={() => aplicarPreset("dia")} />
          <PresetButton label="Últimos 7 días" onClick={() => aplicarPreset("semana")} />
          <PresetButton label="Mes en curso" onClick={() => aplicarPreset("mes")} />
        </div>
        <div className="ml-auto flex items-end gap-3">
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
            className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50"
          >
            {cargando ? "Generando…" : "Actualizar"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {/* Resumen global */}
      <div className="grid gap-4 md:grid-cols-3">
        <TotalCard label="Ingresos" valor={data?.resumen.ingresos ?? 0} tone="emerald" />
        <TotalCard label="Egresos" valor={data?.resumen.egresos ?? 0} tone="rose" />
        <TotalCard label="Diferencia (neto)" valor={data?.resumen.diferencia ?? 0} tone={data && data.resumen.diferencia < 0 ? "rose" : "slate"} />
      </div>

      {/* Dos columnas: Ingresos a la izquierda, Egresos a la derecha */}
      <div className="grid gap-5 md:grid-cols-2">
        <section className={CARD}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-emerald-700">INGRESOS</h2>
            <span className="text-sm font-semibold tabular-nums text-emerald-700">
              {gs(data?.resumen.ingresos ?? 0)}
            </span>
          </div>
          <TablaMovimientos
            movimientos={data?.ingresos ?? []}
            toneBadge="bg-emerald-50 text-emerald-700"
            puedeEditar={esAdmin}
            onEditar={setEditando}
          />
        </section>

        <section className={CARD}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-rose-700">EGRESOS</h2>
            <span className="text-sm font-semibold tabular-nums text-rose-700">
              {gs(data?.resumen.egresos ?? 0)}
            </span>
          </div>
          <TablaMovimientos
            movimientos={data?.egresos ?? []}
            toneBadge="bg-rose-50 text-rose-700"
            puedeEditar={esAdmin}
            onEditar={setEditando}
          />
        </section>
      </div>

      {editando ? (
        <ModalEditar
          mov={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => { setEditando(null); void cargar(); }}
        />
      ) : null}

      {/* Totales por día */}
      {data && data.por_dia.length > 0 ? (
        <section className={CARD}>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Totales por día</h2>
          <table className="w-full text-sm">
            <thead className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Día</th>
                <th className="px-3 py-2 text-right">Ingresos</th>
                <th className="px-3 py-2 text-right">Egresos</th>
                <th className="px-3 py-2 text-right">Neto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.por_dia.map((d) => (
                <tr key={d.dia}>
                  <td className="px-3 py-2 text-slate-700">{diaDe(d.dia)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{gs(d.ingresos)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-rose-700">{gs(d.egresos)}</td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${
                    d.ingresos - d.egresos < 0 ? "text-rose-700" : "text-slate-800"
                  }`}>
                    {gs(d.ingresos - d.egresos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

function PresetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
    >
      {label}
    </button>
  );
}

function TotalCard({ label, valor, tone }: { label: string; valor: number; tone: "emerald" | "rose" | "slate" }) {
  const col = tone === "emerald" ? "text-emerald-700" : tone === "rose" ? "text-rose-700" : "text-slate-900";
  return (
    <div className={CARD}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${col}`}>{gs(valor)}</p>
    </div>
  );
}

function TablaMovimientos({
  movimientos, toneBadge, puedeEditar, onEditar,
}: {
  movimientos: Mov[];
  toneBadge: string;
  puedeEditar: boolean;
  onEditar: (m: Mov) => void;
}) {
  if (movimientos.length === 0) {
    return <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">Sin movimientos en el período.</p>;
  }
  return (
    <div className="max-h-[500px] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          <tr>
            <th className="px-2 py-2 text-left">Fecha</th>
            <th className="px-2 py-2 text-left">Concepto</th>
            <th className="px-2 py-2 text-right">Importe</th>
            {puedeEditar ? <th className="px-2 py-2" /> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {movimientos.map((m) => (
            <tr key={m.id}>
              <td className="px-2 py-2 text-xs text-slate-500 tabular-nums">{dia(m.dia)}</td>
              <td className="px-2 py-2 text-slate-800">
                <div className="flex items-center gap-2">
                  <span>{m.concepto}</span>
                  {m.tipo === "retiro" ? (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${toneBadge}`}>retiro</span>
                  ) : null}
                </div>
                <p className="text-[11px] text-slate-400">
                  {m.medio_pago ? `${m.medio_pago}` : ""}
                  {m.categoria ? ` · ${m.categoria}` : ""}
                  {m.manual ? " · manual" : ""}
                </p>
              </td>
              <td className="px-2 py-2 text-right font-semibold tabular-nums text-slate-800">{gs(m.monto)}</td>
              {puedeEditar ? (
                <td className="px-2 py-2 text-right">
                  {m.manual ? (
                    <button
                      type="button"
                      onClick={() => onEditar(m)}
                      className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Editar movimiento"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-300" title="Viene de una venta: se corrige anulando la venta">—</span>
                  )}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModalEditar({ mov, onCerrar, onGuardado }: { mov: Mov; onCerrar: () => void; onGuardado: () => void }) {
  const [concepto, setConcepto] = useState(mov.concepto);
  const [monto, setMonto] = useState(String(mov.monto));
  const [medio, setMedio] = useState(mov.medio_pago ?? "efectivo");
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true); setErr(null);
    try {
      const m = Number(monto.replace(/\./g, "").replace(/,/g, "."));
      if (!Number.isFinite(m) || m <= 0) { setErr("El importe tiene que ser mayor a 0."); return; }
      const r = await apiFetch(`/api/caja-movimientos/${encodeURIComponent(mov.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concepto: concepto.trim(), monto: m, medio_pago: medio }),
      });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!r.ok || !j.success) { setErr(j.error ?? `Error ${r.status}`); return; }
      onGuardado();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error de red");
    } finally { setGuardando(false); }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Editar movimiento</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {mov.tipo === "ingreso" ? "Ingreso" : mov.tipo === "egreso" ? "Egreso" : "Retiro"} · {dia(mov.dia)}
            </p>
          </div>
          <button type="button" onClick={onCerrar} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Concepto</label>
            <input
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Importe (Gs.)</label>
            <input
              value={monto}
              onChange={(e) => setMonto(e.target.value.replace(/[^\d.,]/g, ""))}
              inputMode="numeric"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Medio de pago</label>
            <select
              value={medio}
              onChange={(e) => setMedio(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            >
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="cheque">Cheque</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          {err ? <p className="text-xs text-rose-600">{err}</p> : null}
          <p className="text-[11px] text-slate-500">
            Si la caja de este movimiento ya se cerró, el cambio modifica el total del cierre.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando || concepto.trim() === ""}
            className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
