"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Plus, Lock } from "lucide-react";
import { useArqueo } from "@/shared/hooks/useArqueo";
import { useCajaAbierta } from "@/shared/hooks/useCajaAbierta";
import { cerrarCaja, registrarMovimientoCaja, type TipoMovimientoCaja } from "@/lib/cajas/storage";
import type { ArqueoCaja, MovimientoManualCaja } from "@/lib/cajas/arqueo";
import AperturaCaja from "./AperturaCaja";

const TEAL = "#4FAEB2";

const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString("es-PY")}`;

/** Un movimiento de estos tipos saca plata del cajón. */
function esSalida(tipo: string): boolean {
  return tipo === "egreso" || tipo === "retiro";
}

function fechaLarga(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function horaCorta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Total cobrado por un medio puntual, 0 si ese medio no se usó hoy. */
function porMedio(caja: ArqueoCaja, medio: string): number {
  return caja.ingresos.por_medio.find((m) => m.medio === medio)?.total ?? 0;
}

// ── Cifras ────────────────────────────────────────────────────────────────────

function Cifra({
  label,
  valor,
  destacado,
}: {
  label: string;
  valor: number;
  destacado?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        destacado ? "border-[#4FAEB2]/50 bg-[#4FAEB2]/8" : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 whitespace-nowrap text-lg font-semibold tabular-nums tracking-tight ${
          destacado ? "text-[#3F8E91]" : "text-slate-900"
        }`}
      >
        {gs(valor)}
      </p>
    </div>
  );
}

// ── Movimientos manuales ──────────────────────────────────────────────────────

function ListaMovimientos({ movimientos }: { movimientos: MovimientoManualCaja[] }) {
  return (
    <div className="mt-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        Movimientos manuales
      </p>
      {movimientos.length === 0 ? (
        <p className="mt-2 text-xs text-slate-400">
          Nada cargado a mano. Lo que salga del cajón —combustible, adelantos— va acá para que el
          cierre no quede con una diferencia sin explicar.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {movimientos.map((m, i) => {
            const salida = esSalida(m.tipo);
            return (
              <li key={i} className="flex items-center gap-3 px-3.5 py-2.5">
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    salida ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                  }`}
                >
                  {salida ? (
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDownLeft className="h-3.5 w-3.5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-800">{m.concepto}</p>
                  <p className="text-[11px] text-slate-500">
                    {m.label}
                    {m.fecha ? ` · ${horaCorta(m.fecha)}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    salida ? "text-red-600" : "text-emerald-700"
                  }`}
                >
                  {salida ? "−" : "+"}
                  {gs(m.monto)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Formulario de movimiento ──────────────────────────────────────────────────

function FormMovimiento({
  cajaId,
  onListo,
  onCancelar,
}: {
  cajaId: string;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoMovimientoCaja>("egreso");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [medio, setMedio] = useState("efectivo");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valor = Number(monto);
  const listo = concepto.trim() !== "" && Number.isFinite(valor) && valor > 0;

  async function guardar() {
    if (guardando || !listo) return;
    setGuardando(true);
    setError(null);
    const res = await registrarMovimientoCaja(cajaId, {
      tipo,
      concepto: concepto.trim(),
      monto: valor,
      medio_pago: medio,
    });
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onListo();
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Tipo</span>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoMovimientoCaja)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          >
            <option value="egreso">Egreso (gasto)</option>
            <option value="retiro">Retiro</option>
            <option value="ingreso">Ingreso</option>
            <option value="ajuste">Ajuste</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Medio</span>
          <select
            value={medio}
            onChange={(e) => setMedio(e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          >
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="cheque">Cheque</option>
            <option value="otro">Otro</option>
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600">Concepto</span>
          <input
            value={concepto}
            onChange={(e) => {
              setError(null);
              setConcepto(e.target.value);
            }}
            placeholder="Combustible, adelanto, vuelto…"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Monto</span>
          <input
            inputMode="numeric"
            value={monto}
            onChange={(e) => {
              setError(null);
              setMonto(e.target.value);
            }}
            placeholder="0"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          />
        </label>
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando || !listo}
          className="h-10 rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-40"
          style={{ backgroundColor: TEAL }}
        >
          {guardando ? "Guardando…" : "Guardar movimiento"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="h-10 rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Cierre ────────────────────────────────────────────────────────────────────

function FormCierre({
  cajaId,
  esperado,
  onListo,
  onCancelar,
}: {
  cajaId: string;
  esperado: number;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [monto, setMonto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valor = Number(monto);
  const valido = monto.trim() !== "" && Number.isFinite(valor) && valor >= 0;
  const diferencia = valido ? valor - esperado : 0;

  async function guardar() {
    if (guardando) return;
    if (!valido) {
      setError("Contá el efectivo del cajón antes de cerrar.");
      return;
    }
    setGuardando(true);
    setError(null);
    const res = await cerrarCaja(cajaId, valor);
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onListo();
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-800">Cerrar la caja</p>
      <p className="mt-0.5 text-xs text-slate-500">
        El sistema espera {gs(esperado)} en el cajón. Poné lo que contaste: la diferencia se guarda,
        no bloquea el cierre.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Efectivo contado</span>
          <input
            inputMode="numeric"
            value={monto}
            onChange={(e) => {
              setError(null);
              setMonto(e.target.value);
            }}
            placeholder="0"
            className="h-10 w-40 rounded-lg border border-slate-200 bg-white px-3 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          />
        </label>
        {valido ? (
          <p className="pb-2.5 text-xs text-slate-600">
            Diferencia:{" "}
            <span
              className={`font-semibold tabular-nums ${
                diferencia === 0
                  ? "text-emerald-700"
                  : diferencia < 0
                    ? "text-red-600"
                    : "text-amber-700"
              }`}
            >
              {diferencia > 0 ? "+" : ""}
              {gs(diferencia)}
            </span>
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="h-10 rounded-lg bg-slate-700 px-5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {guardando ? "Cerrando…" : "Confirmar cierre"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="h-10 rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Tarjeta ───────────────────────────────────────────────────────────────────

/**
 * La caja del día con sus números abiertos.
 *
 * Mientras la caja está abierta lo que importa no es cuánto se facturó sino
 * cuánto tiene que haber en el cajón: por eso la cifra destacada es el efectivo
 * esperado y al lado están los movimientos que lo explican. El total del día ya
 * lo cuenta el arqueo; repetirlo acá arriba solo tapaba esto.
 */
export default function TarjetaCajaAbierta() {
  const { caja, disponible, mutate: recargarCaja } = useCajaAbierta();
  const { arqueo, mutate: recargarArqueo } = useArqueo();
  const [panel, setPanel] = useState<"ninguno" | "movimiento" | "cierre">("ninguno");

  function refrescar() {
    setPanel("ninguno");
    void recargarCaja();
    void recargarArqueo();
  }

  if (!disponible) return null;

  // Sin caja abierta lo único que hace falta es abrirla.
  if (!caja) return <AperturaCaja caja={null} onCambio={refrescar} />;

  const detalle = arqueo?.cajas.find((c) => c.id === caja.id) ?? null;
  const apertura = detalle?.monto_apertura ?? caja.monto_apertura;
  const ventas = detalle?.ingresos.total ?? 0;
  const esperado = detalle?.efectivo.esperado ?? apertura;
  const movimientos = detalle?.movimientos_manuales ?? [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              Caja N° {caja.numero_caja}
            </h2>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              Abierta
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Abierta el {fechaLarga(caja.fecha_apertura)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPanel(panel === "movimiento" ? "ninguno" : "movimiento")}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Movimiento
          </button>
          <button
            type="button"
            onClick={() => setPanel(panel === "cierre" ? "ninguno" : "cierre")}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-700 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
          >
            <Lock className="h-3.5 w-3.5" />
            Cerrar
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Cifra label="Apertura" valor={apertura} />
        <Cifra label="Ventas" valor={ventas} />
        <Cifra label="Efectivo" valor={detalle ? porMedio(detalle, "efectivo") : 0} />
        <Cifra label="Transferencia" valor={detalle ? porMedio(detalle, "transferencia") : 0} />
        <Cifra label="Tarjeta" valor={detalle ? porMedio(detalle, "tarjeta") : 0} />
        <Cifra label="Esperado efectivo" valor={esperado} destacado />
      </div>

      {panel === "movimiento" ? (
        <FormMovimiento
          cajaId={caja.id}
          onListo={refrescar}
          onCancelar={() => setPanel("ninguno")}
        />
      ) : null}

      {panel === "cierre" ? (
        <FormCierre
          cajaId={caja.id}
          esperado={esperado}
          onListo={refrescar}
          onCancelar={() => setPanel("ninguno")}
        />
      ) : null}

      <ListaMovimientos movimientos={movimientos} />
    </div>
  );
}
