"use client";

/**
 * Cortes de efectivo del salón (pedido Distribuidora JM, 14-nov-2026 #1B).
 *
 * Cada corte es un "retiro" de la caja abierta: baja el efectivo del cajón sin
 * descontarlo de las ventas. Se cargan los 4 cortes del día (1er, 2do, 3er,
 * Último), cada uno con su hora, importe y responsable automático (el usuario
 * logueado que lo cargó). Reutiliza /api/cajas/[id]/movimientos con tipo
 * 'retiro' y categoría 'corte', para que aparezcan en el arqueo normal.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Clock, Scissors, Check } from "lucide-react";
import { apiFetch } from "@/lib/api/fetch-with-supabase-session";
import { useCajaAbierta } from "@/shared/hooks/useCajaAbierta";

const TZ = "America/Asuncion";
const gs = (n: number) => `Gs. ${Math.round(Number(n) || 0).toLocaleString("es-PY")}`;
const horaCorta = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString("es-PY", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

type Mov = {
  id: string;
  tipo: string;
  categoria: string | null;
  concepto: string;
  monto: number;
  medio_pago: string | null;
  usuario_email: string | null;
  created_at: string;
};

const SLOTS = [
  { nro: 1, titulo: "1er corte" },
  { nro: 2, titulo: "2do corte" },
  { nro: 3, titulo: "3er corte" },
  { nro: 4, titulo: "Último corte" },
] as const;

export default function CortesDeCajaPage() {
  const { caja, disponible, isLoading } = useCajaAbierta();

  const key = caja?.id ? `cortes:${caja.id}` : null;
  const { data: cortes, mutate } = useSWR<Mov[]>(
    key,
    async () => {
      if (!caja?.id) return [];
      const r = await apiFetch(`/api/cajas/${caja.id}/movimientos?tipo=retiro&categoria=corte`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { data?: { movimientos?: Mov[] } };
      return j.data?.movimientos ?? [];
    },
    { revalidateOnFocus: true, dedupingInterval: 5_000 }
  );

  const cortesOrden = useMemo(() => {
    return (cortes ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [cortes]);

  const total = cortesOrden.reduce((s, m) => s + Number(m.monto || 0), 0);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Caja</p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Cortes de efectivo del salón</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cargá cada corte de caja con su importe y hora. Cada corte baja el efectivo del cajón pero no se
          vuelve a descontar de las ventas (la plata se la llevaron al resguardo).
        </p>
      </div>

      {isLoading ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Cargando caja…</p>
      ) : !disponible || !caja ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Todavía no hay caja abierta.</p>
          <p className="mt-1 text-xs">
            Para cargar un corte, primero abrí la caja desde{" "}
            <Link href="/ventas" className="underline">Caja</Link>.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {SLOTS.map((s) => {
              const corte = cortesOrden[s.nro - 1] ?? null;
              return (
                <SlotCorte
                  key={s.nro}
                  numero={s.nro}
                  titulo={s.titulo}
                  corte={corte}
                  cajaId={caja.id}
                  onCargado={() => void mutate()}
                />
              );
            })}
          </div>

          <ListaCortes cortes={cortesOrden} total={total} />
        </>
      )}
    </div>
  );
}

function SlotCorte({
  numero, titulo, corte, cajaId, onCargado,
}: {
  numero: number;
  titulo: string;
  corte: Mov | null;
  cajaId: string;
  onCargado: () => void;
}) {
  const [monto, setMonto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cargado = corte !== null;

  async function guardar() {
    setErr(null);
    const n = Number(monto.replace(/\./g, "").replace(/,/g, "."));
    if (!Number.isFinite(n) || n <= 0) { setErr("Importe inválido."); return; }
    setGuardando(true);
    try {
      const r = await apiFetch(`/api/cajas/${encodeURIComponent(cajaId)}/movimientos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "retiro",
          concepto: titulo,
          monto: n,
          medio_pago: "efectivo",
          categoria: "corte",
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!r.ok || !j.success) { setErr(j.error ?? `Error ${r.status}`); return; }
      setMonto("");
      onCargado();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${cargado ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scissors className={`h-4 w-4 ${cargado ? "text-emerald-700" : "text-slate-400"}`} />
          <h3 className="text-sm font-semibold text-slate-900">{titulo}</h3>
        </div>
        {cargado ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            <Check className="h-3 w-3" /> Cargado
          </span>
        ) : (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Pendiente</span>
        )}
      </div>

      {cargado && corte ? (
        <div className="mt-3 space-y-1">
          <p className="text-xl font-bold tabular-nums text-slate-900">{gs(corte.monto)}</p>
          <p className="flex items-center gap-1 text-xs text-slate-500">
            <Clock className="h-3 w-3" /> {horaCorta(corte.created_at)}
            {corte.usuario_email ? ` · ${corte.usuario_email}` : ""}
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <input
            inputMode="numeric"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="Importe (Gs.)"
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm tabular-nums outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          />
          {err ? <p className="text-[11px] text-rose-600">{err}</p> : null}
          <button
            type="button"
            disabled={guardando || monto.trim() === ""}
            onClick={() => void guardar()}
            className="w-full rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50"
          >
            {guardando ? "Guardando…" : `Registrar ${titulo.toLowerCase()}`}
          </button>
        </div>
      )}
    </div>
  );
}

function ListaCortes({ cortes, total }: { cortes: Mov[]; total: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Cortes cargados hoy</h2>
        <span className="text-sm font-semibold tabular-nums text-slate-900">
          Total: {gs(total)}
        </span>
      </div>
      {cortes.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
          Aún no hay cortes cargados en esta caja.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left">Orden</th>
              <th className="px-2 py-2 text-left">Concepto</th>
              <th className="px-2 py-2 text-left">Hora</th>
              <th className="px-2 py-2 text-left">Responsable</th>
              <th className="px-2 py-2 text-right">Importe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cortes.map((m, i) => (
              <tr key={m.id}>
                <td className="px-2 py-2 text-xs text-slate-500">{i + 1}°</td>
                <td className="px-2 py-2 text-slate-800">{m.concepto}</td>
                <td className="px-2 py-2 text-xs text-slate-500 tabular-nums">{horaCorta(m.created_at)}</td>
                <td className="px-2 py-2 text-xs text-slate-500">{m.usuario_email ?? "—"}</td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums text-slate-900">{gs(m.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
