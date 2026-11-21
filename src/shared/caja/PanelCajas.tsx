"use client";

import { useState } from "react";
import useSWR from "swr";
import { Printer } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import PlanillaArqueo from "@/shared/caja/PlanillaArqueo";
import { horaCorta, TEAL } from "@/shared/caja/arqueo-ui";

type Grupo = {
  key: string;
  titulo: string;
  online: boolean;
  apertura: { monto: number; hora: string | null };
  cajas: { id: string; numero_caja: number; estado: "abierta" | "cerrada"; fecha_apertura: string; fecha_cierre: string | null; monto_apertura: number }[];
  ventas: { cantidad: number; total: number; contado: number; credito: number; efectivo: number; transferencia: number; cheque: number; otros: number };
  cobranzas: { efectivo: number; transferencia: number; cheque: number; otros: number; total: number };
  facturacion: { cantidad: number; total: number };
  productos: { nombre: string; cantidad: number; monto: number }[];
  creditos: { total: number; clientes: { cliente: string; saldo: number; facturas: number }[] };
};
type Panel = { desde: string; hasta: string; grupos: Grupo[] };

const gs = (v: number) => `Gs. ${Math.round(v).toLocaleString("es-PY")}`;

async function cargar(desde: string, hasta: string): Promise<Panel | null> {
  const res = await fetchWithSupabaseSession(`/api/cajas/panel?desde=${desde}&hasta=${hasta}`, { cache: "no-store" });
  const json = (await res.json()) as { success?: boolean; data?: { panel?: Panel } };
  return res.ok && json.success ? (json.data?.panel ?? null) : null;
}

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{titulo}</h3>
      {children}
    </section>
  );
}

function Fila({ label, valor, fuerte }: { label: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 text-sm ${fuerte ? "border-t border-slate-100 pt-2 font-bold text-slate-900" : "text-slate-600"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );
}

/**
 * Panel del arqueo separado por Caja Salón, cada camión y Administración.
 * Cada pestaña muestra solo lo de sus cajas. Se actualiza solo cada 30 s.
 */
export default function PanelCajas({ desde, hasta, onCambio }: { desde: string; hasta: string; onCambio?: () => void }) {
  const [elegida, setElegida] = useState<string>("salon");
  const { data, isLoading, mutate } = useSWR(`cajas:panel:${desde}:${hasta}`, () => cargar(desde, hasta), {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

  if (isLoading && !data) return <p className="py-16 text-center text-sm text-slate-400">Cargando…</p>;
  if (!data) return <p className="py-16 text-center text-sm text-slate-500">No se pudo cargar el panel de cajas.</p>;

  const g = data.grupos.find((x) => x.key === elegida) ?? data.grupos[0];
  const esUnDia = data.desde === data.hasta;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden" role="tablist">
        {data.grupos.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={x.key === g.key}
            onClick={() => setElegida(x.key)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
              x.key === g.key ? "border-transparent text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
            style={x.key === g.key ? { backgroundColor: TEAL } : undefined}
          >
            <span className={`h-2 w-2 rounded-full ${x.online ? "bg-emerald-400" : "bg-slate-300"}`} />
            {x.titulo}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-900">{g.titulo}</h2>
          <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${g.online ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {g.online ? "Online · caja abierta" : "Offline · caja cerrada"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 print:hidden"
        >
          <Printer className="h-4 w-4" />
          Imprimir rendición
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Tarjeta titulo="Apertura de caja">
          <Fila label="Monto inicial" valor={gs(g.apertura.monto)} />
          <Fila label="Hora de apertura" valor={g.apertura.hora ? horaCorta(g.apertura.hora) : "—"} />
          <Fila label="Cajas del período" valor={String(g.cajas.length)} />
        </Tarjeta>

        <Tarjeta titulo="Ventas">
          <Fila label="Efectivo" valor={gs(g.ventas.efectivo)} />
          <Fila label="Transferencias" valor={gs(g.ventas.transferencia)} />
          <Fila label="Cheques" valor={gs(g.ventas.cheque)} />
          {g.ventas.otros > 0 ? <Fila label="Otros medios" valor={gs(g.ventas.otros)} /> : null}
          <Fila label="A crédito" valor={gs(g.ventas.credito)} />
          <Fila label={`Total vendido (${g.ventas.cantidad})`} valor={gs(g.ventas.total)} fuerte />
        </Tarjeta>

        <Tarjeta titulo="Cobranzas">
          <Fila label="Efectivo" valor={gs(g.cobranzas.efectivo)} />
          <Fila label="Transferencias" valor={gs(g.cobranzas.transferencia)} />
          <Fila label="Cheques" valor={gs(g.cobranzas.cheque)} />
          {g.cobranzas.otros > 0 ? <Fila label="Otros medios" valor={gs(g.cobranzas.otros)} /> : null}
          <Fila label="Total cobrado" valor={gs(g.cobranzas.total)} fuerte />
        </Tarjeta>

        <Tarjeta titulo="Facturación del día">
          <Fila label="Facturas emitidas" valor={String(g.facturacion.cantidad)} />
          <Fila label="Monto total" valor={gs(g.facturacion.total)} fuerte />
        </Tarjeta>

        <Tarjeta titulo="Productos más vendidos">
          {g.productos.length === 0 ? (
            <p className="text-sm text-slate-400">Sin ventas en el período.</p>
          ) : (
            <ol className="space-y-1 text-sm">
              {g.productos.map((p, i) => (
                <li key={p.nombre} className="flex items-center justify-between gap-2 text-slate-600">
                  <span className="truncate">{i + 1}. {p.nombre}</span>
                  <span className="shrink-0 tabular-nums">
                    {p.cantidad.toLocaleString("es-PY", { maximumFractionDigits: 2 })} · {gs(p.monto)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Tarjeta>

        <Tarjeta titulo="Créditos pendientes">
          {g.creditos.clientes.length === 0 ? (
            <p className="text-sm text-slate-400">Sin saldos pendientes.</p>
          ) : (
            <>
              <ul className="space-y-1 text-sm">
                {g.creditos.clientes.map((c) => (
                  <li key={c.cliente} className="flex items-center justify-between gap-2 text-slate-600">
                    <span className="truncate">{c.cliente}</span>
                    <span className="shrink-0 tabular-nums">{gs(c.saldo)}</span>
                  </li>
                ))}
              </ul>
              <Fila label="Total pendiente" valor={gs(g.creditos.total)} fuerte />
            </>
          )}
        </Tarjeta>
      </div>

      <h3 className="mb-3 mt-8 text-sm font-semibold text-slate-700">Cierre de caja</h3>
      {!esUnDia ? (
        <p className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
          Elegí un solo día (Desde = Hasta) para ver y firmar la planilla de cierre de cada caja.
        </p>
      ) : g.cajas.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
          No hubo cajas abiertas este día.
        </p>
      ) : (
        <div className="space-y-6">
          {g.cajas.map((c) => (
            <PlanillaArqueo
              key={c.id}
              cajaId={c.id}
              inline
              onGuardada={() => {
                mutate();
                onCambio?.();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
