"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Ban, Plus, Printer, ReceiptText, Search, ShoppingCart } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { METODOS_COBRO } from "@/lib/ventas/types";
import ReciboCobro, { type DatosReciboCobro } from "@/shared/caja/ReciboCobro";
import ModalCaja from "@/shared/caja/ModalCaja";
import MontoInput from "@/components/ui/MontoInput";
import SmartCombobox from "@/components/ui/SmartCombobox";
import { useClientes } from "@/shared/hooks/useClientes";
import { clienteNombre } from "@/lib/clientes/storage";
import CobranzasTabs from "./CobranzasTabs";

type Recibo = {
  id: string;
  numero: number;
  fecha: string;
  cliente_nombre: string;
  cliente_ruc: string | null;
  monto: number;
  medio_pago: string | null;
  concepto: string | null;
  venta_numero: string | null;
  saldo_restante: number | null;
  usuario_nombre: string | null;
  anulado: boolean;
  tipo: "cobro" | "deposito";
  aplicado: number;
  cliente_id: string | null;
  referencia: string | null;
};

type Filtro = "todos" | "cobro" | "deposito" | "con-saldo";

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString("es-PY")}`;
const numero = (n: number) => `REC-${String(n).padStart(6, "0")}`;
const medioLabel = (v: string | null) => METODOS_COBRO.find((m) => m.value === v)?.label ?? v ?? "—";

function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-PY", {
    timeZone: "America/Asuncion",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const INPUT =
  "h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/30";

const saldoDe = (r: Recibo) => Math.max(0, r.monto - r.aplicado);

function datosImpresion(r: Recibo): DatosReciboCobro {
  const deposito = r.tipo === "deposito";
  return {
    cliente: r.cliente_nombre,
    clienteRuc: r.cliente_ruc,
    ventaNumero: r.venta_numero ?? "",
    monto: r.monto,
    saldo: r.saldo_restante,
    medioPago: r.medio_pago ?? "efectivo",
    fecha: r.fecha,
    reciboNumero: numero(r.numero),
    concepto: deposito
      ? `Depósito a cuenta (saldo a favor para próximas compras)${r.referencia ? ` · Ref.: ${r.referencia}` : ""}`
      : undefined,
  };
}

/**
 * Cobranzas → Recibos de dinero: los pagos que hace el cliente, numerados.
 * Cobros de ventas a crédito y depósitos a cuenta (anticipos): el depósito
 * queda como saldo a favor y con «Pasar a venta» se usa en la caja.
 */
export default function RecibosDinero() {
  const router = useRouter();
  const [desde, setDesde] = useState(`${hoy().slice(0, 8)}01`);
  const [hasta, setHasta] = useState(hoy());
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [imprimir, setImprimir] = useState<DatosReciboCobro | null>(null);
  const [nuevoDeposito, setNuevoDeposito] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const url = `/api/cobranzas/recibos?desde=${desde}&hasta=${hasta}${filtro === "con-saldo" ? "&con_saldo=1" : ""}`;
  type Respuesta = { disponible: boolean; depositos?: boolean; recibos: Recibo[] };
  const { data, error, isLoading, mutate } = useSWR<Respuesta>(
    url,
    async () => {
      const res = await fetchWithSupabaseSession(url);
      const j = (await res.json().catch(() => ({}))) as { data?: Respuesta; error?: string };
      if (!res.ok || !j.data) throw new Error(j.error ?? "No se pudieron leer los recibos.");
      return j.data;
    },
    { revalidateOnFocus: true, keepPreviousData: true }
  );

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.recibos ?? []).filter(
      (r) =>
        (filtro === "todos" || filtro === "con-saldo" || (r.tipo ?? "cobro") === filtro) &&
        (!t ||
        r.cliente_nombre.toLowerCase().includes(t) ||
        numero(r.numero).toLowerCase().includes(t) ||
        String(r.numero) === t.replace(/\D/g, "") ||
        (r.venta_numero ?? "").toLowerCase().includes(t) ||
        (r.cliente_ruc ?? "").includes(t))
    );
  }, [data, q, filtro]);
  const total =
    filtro === "con-saldo"
      ? lista.reduce((s, r) => s + saldoDe(r), 0)
      : lista.filter((r) => !r.anulado).reduce((s, r) => s + r.monto, 0);
  const hayDepositos = Boolean(data?.depositos);

  function pasarAVenta(id: string) {
    router.push(`/ventas/nueva?deposito=${id}`);
  }

  async function anular(r: Recibo) {
    if (!window.confirm(`¿Anular el depósito ${numero(r.numero)} de ${r.cliente_nombre} por ${gs(r.monto)}?`)) return;
    setAviso(null);
    const res = await fetchWithSupabaseSession(`/api/cobranzas/depositos/${r.id}/anular`, { method: "POST" });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) setAviso(j.error ?? "No se pudo anular el depósito.");
    void mutate();
  }

  return (
    <div className="space-y-5 px-4 pb-24 pt-4 sm:px-6 sm:pb-10">
      <div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
          />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Operativo</p>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
            <ReceiptText className="h-6 w-6 text-slate-400" />
            Recibos de dinero
          </h1>
          <button
            type="button"
            onClick={() => (hayDepositos ? setNuevoDeposito(true) : setAviso("Falta correr el SQL 56 (depósitos de clientes)."))}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91]"
          >
            <Plus className="h-4 w-4" />
            Depósito cliente
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Los pagos que hace el cliente: cobros de ventas a crédito y depósitos a cuenta. El depósito queda como saldo a
          favor y con «Pasar a venta» se usa en la caja.
        </p>
      </div>

      <CobranzasTabs />

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Tipo de recibo">
        {(
          [
            ["todos", "Todos"],
            ["cobro", "Cobros"],
            ["deposito", "Depósitos"],
            ["con-saldo", "Depósitos con saldo"],
          ] as [Filtro, string][]
        ).map(([v, t]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={filtro === v}
            onClick={() => setFiltro(v)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              filtro === v ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {filtro === "con-saldo" ? (
          <p className="self-center text-xs text-slate-500">De cualquier fecha: todos los depósitos que todavía tienen saldo.</p>
        ) : (
          <>
            <label className="text-xs font-semibold text-slate-500">
              Desde
              <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value || desde)} className={`${INPUT} mt-1 block`} />
            </label>
            <label className="text-xs font-semibold text-slate-500">
              Hasta
              <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value || hasta)} className={`${INPUT} mt-1 block`} />
            </label>
          </>
        )}
        <div className="relative min-w-0 flex-1 basis-60">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por cliente, N° de recibo o de venta…"
            className={`${INPUT} w-full pl-9`}
          />
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2">
          <p className="text-[11px] font-semibold text-emerald-700">
            {lista.length} {filtro === "con-saldo" ? "con saldo" : "recibos"}
          </p>
          <p className="text-base font-bold tabular-nums text-emerald-900">{gs(total)}</p>
        </div>
      </div>

      {aviso ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{aviso}</p> : null}

      {error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{(error as Error).message}</p>
      ) : data && !data.disponible ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Falta correr el SQL 53 (recibos de dinero). Mientras tanto el recibo se imprime al cobrar, pero no queda numerado acá.
        </p>
      ) : isLoading && !data ? (
        <p className="py-8 text-sm text-slate-400">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          {filtro === "con-saldo" ? "No hay depósitos con saldo." : "No hay recibos en estas fechas."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full whitespace-nowrap text-sm [&_td]:px-3 [&_th]:px-3">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">N° recibo</th>
                <th className="px-3 py-3">Fecha</th>
                <th className="px-3 py-3">Cliente</th>
                <th className="px-3 py-3">Concepto</th>
                <th className="px-3 py-3 text-right">Monto</th>
                <th className="hidden px-3 py-3 2xl:table-cell">Cobró</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((r) => {
                const deposito = r.tipo === "deposito";
                const saldo = saldoDe(r);
                return (
                <tr key={r.id} className={r.anulado ? "text-slate-400 line-through" : "text-slate-800"}>
                  <td className="px-3 py-3 font-mono text-xs font-semibold">{numero(r.numero)}</td>
                  <td className="px-3 py-3 tabular-nums text-slate-500">{fechaHora(r.fecha)}</td>
                  <td className="px-3 py-3 font-medium">
                    {r.cliente_nombre}
                    {r.cliente_ruc ? <span className="block text-xs font-normal text-slate-400">{r.cliente_ruc}</span> : null}
                  </td>
                  <td className="max-w-56 px-3 py-3 text-slate-600" title={r.concepto ?? ""}>
                    {deposito ? (
                      <>
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 no-underline">
                          Depósito
                        </span>
                        {r.anulado ? null : saldo > 0 ? (
                          <span className="block text-xs font-semibold text-emerald-700">Saldo {gs(saldo)}</span>
                        ) : (
                          <span className="block text-xs text-slate-400">Usado</span>
                        )}
                        {r.referencia ? (
                          <span className="block truncate text-xs text-slate-400">Ref.: {r.referencia}</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="block truncate">{r.venta_numero ? `Venta ${r.venta_numero}` : (r.concepto ?? "—")}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="block font-semibold tabular-nums">{gs(r.monto)}</span>
                    <span className="block text-xs text-slate-400">{medioLabel(r.medio_pago)}</span>
                  </td>
                  <td className="hidden max-w-32 truncate px-3 py-3 text-xs text-slate-500 2xl:table-cell" title={r.usuario_nombre ?? ""}>
                    {r.usuario_nombre ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {r.anulado ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 no-underline">Anulado</span>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        {deposito && saldo > 0 ? (
                          <button
                            type="button"
                            onClick={() => pasarAVenta(r.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#4FAEB2] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#3F8E91]"
                          >
                            <ShoppingCart className="h-3.5 w-3.5" />
                            Pasar a venta
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setImprimir(datosImpresion(r))}
                          title="Reimprimir"
                          aria-label="Reimprimir"
                          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        {deposito && r.aplicado === 0 ? (
                          <button
                            type="button"
                            onClick={() => void anular(r)}
                            title="Anular depósito"
                            aria-label="Anular depósito"
                            className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                          >
                            <Ban className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {imprimir ? <ReciboCobro datos={imprimir} onCerrar={() => setImprimir(null)} /> : null}

      {nuevoDeposito ? (
        <NuevoDeposito
          onCerrar={() => setNuevoDeposito(false)}
          onRegistrado={() => void mutate()}
          onImprimir={(d) => {
            setNuevoDeposito(false);
            setImprimir(d);
          }}
          onPasarAVenta={pasarAVenta}
        />
      ) : null}
    </div>
  );
}

type DepositoRegistrado = { id: string; recibo_numero: string; cliente: string; cliente_ruc: string | null };

/** El cliente deja plata a cuenta: queda como recibo (saldo a favor), sin tocar la caja. */
function NuevoDeposito({
  onCerrar,
  onRegistrado,
  onImprimir,
  onPasarAVenta,
}: {
  onCerrar: () => void;
  onRegistrado: () => void;
  onImprimir: (d: DatosReciboCobro) => void;
  onPasarAVenta: (id: string) => void;
}) {
  const { clientes } = useClientes();
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [monto, setMonto] = useState(0);
  const [medio, setMedio] = useState("efectivo");
  const [referencia, setReferencia] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<(DepositoRegistrado & { fecha: string }) | null>(null);

  const opciones = useMemo(
    () =>
      clientes.map((c) => ({
        id: c.id,
        label: clienteNombre(c),
        sub: c.ruc_factura || c.ruc || c.documento || c.codigo_cliente || null,
      })),
    [clientes]
  );

  async function guardar() {
    if (!clienteId) return setError("Elegí el cliente.");
    if (!(monto > 0)) return setError("Poné el monto del depósito.");
    setGuardando(true);
    setError(null);
    try {
      const res = await fetchWithSupabaseSession("/api/cobranzas/depositos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: clienteId, monto, medio_pago: medio, referencia, observaciones }),
      });
      const j = (await res.json().catch(() => ({}))) as { data?: DepositoRegistrado; error?: string };
      if (!res.ok || !j.data) throw new Error(j.error ?? "No se pudo registrar el depósito.");
      setHecho({ ...j.data, fecha: new Date().toISOString() });
      onRegistrado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el depósito.");
    } finally {
      setGuardando(false);
    }
  }

  const BOTON = "rounded-lg px-4 py-2 text-sm font-semibold";

  if (hecho) {
    const datos: DatosReciboCobro = {
      cliente: hecho.cliente,
      clienteRuc: hecho.cliente_ruc,
      ventaNumero: "",
      monto,
      saldo: null,
      medioPago: medio,
      fecha: hecho.fecha,
      reciboNumero: hecho.recibo_numero,
      concepto: `Depósito a cuenta (saldo a favor para próximas compras)${referencia.trim() ? ` · Ref.: ${referencia.trim()}` : ""}`,
    };
    return (
      <ModalCaja
        titulo={`Depósito registrado · ${hecho.recibo_numero}`}
        subtitulo={`${hecho.cliente} · ${gs(monto)} a favor`}
        onCerrar={onCerrar}
        pie={
          <>
            <button type="button" onClick={onCerrar} className={`${BOTON} text-slate-600 hover:bg-slate-100`}>
              Cerrar
            </button>
            <button
              type="button"
              onClick={() => onImprimir(datos)}
              className={`${BOTON} inline-flex items-center gap-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50`}
            >
              <Printer className="h-4 w-4" />
              Imprimir recibo
            </button>
            <button
              type="button"
              onClick={() => onPasarAVenta(hecho.id)}
              className={`${BOTON} inline-flex items-center gap-1.5 bg-[#4FAEB2] text-white hover:bg-[#3F8E91]`}
            >
              <ShoppingCart className="h-4 w-4" />
              Pasar a venta
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Quedó anotado como saldo a favor de <b>{hecho.cliente}</b>. Cuando compre, tocá <b>Pasar a venta</b>: la caja
          se abre con este cliente y el depósito paga la venta. Si la venta es mayor, se cobra solo la diferencia; si es
          menor, lo que sobra le queda para la próxima.
        </p>
      </ModalCaja>
    );
  }

  return (
    <ModalCaja
      titulo="Depósito cliente"
      subtitulo="El cliente deja plata a cuenta: queda como saldo a favor para sus compras."
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" onClick={onCerrar} className={`${BOTON} text-slate-600 hover:bg-slate-100`}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando}
            className={`${BOTON} bg-[#4FAEB2] text-white hover:bg-[#3F8E91] disabled:opacity-50`}
          >
            {guardando ? "Guardando…" : "Registrar depósito"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* div y no label: dentro de un label, el clic en una opción vuelve a abrir el combo. */}
        <div>
          <span className="mb-1 block text-xs font-semibold text-slate-600">Cliente</span>
          <SmartCombobox
            options={opciones}
            value={clienteId}
            onChange={setClienteId}
            allowClear={false}
            placeholder="Buscar cliente por nombre, RUC o cédula…"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Monto</span>
            <MontoInput
              value={monto}
              onChange={setMonto}
              decimals={false}
              placeholder="0"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Forma de pago</span>
            <select
              value={medio}
              onChange={(e) => setMedio(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
            >
              {METODOS_COBRO.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Referencia (opcional)</span>
          <input
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="N° de transferencia, banco, cheque…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Observaciones (opcional)</span>
          <input
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
          />
        </label>
        {error ? <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</p> : null}
      </div>
    </ModalCaja>
  );
}
