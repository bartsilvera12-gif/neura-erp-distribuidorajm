"use client";

import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Clock,
  CreditCard,
  Landmark,
  Lock,
  Plus,
  Wallet,
} from "lucide-react";
import { useArqueo } from "@/shared/hooks/useArqueo";
import { useCajaAbierta } from "@/shared/hooks/useCajaAbierta";
import { cerrarCaja, registrarMovimientoCaja, type TipoMovimientoCaja } from "@/lib/cajas/storage";
import type { ArqueoCaja, MovimientoManualCaja } from "@/lib/cajas/arqueo";
import AperturaCaja from "./AperturaCaja";
import ModalCaja from "./ModalCaja";

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

/** Total cobrado por un medio puntual, 0 si ese medio no se usó hoy. */
function porMedio(caja: ArqueoCaja | null, medio: string): number {
  return caja?.ingresos.por_medio.find((m) => m.medio === medio)?.total ?? 0;
}

/** Cuántas ventas entraron por ese medio, para poder decir "efectivo (15)". */
function cantidadPorMedio(caja: ArqueoCaja | null, medio: string): number {
  return caja?.ingresos.por_medio.find((m) => m.medio === medio)?.cantidad ?? 0;
}

/** Lo que salió del cajón EN EFECTIVO: es lo único que baja el esperado. */
function egresosEfectivo(movimientos: MovimientoManualCaja[]): number {
  return movimientos
    .filter((m) => esSalida(m.tipo) && m.medio === "efectivo")
    .reduce((s, m) => s + m.monto, 0);
}

/**
 * Monto en guaraníes tal como se escribe: "3.080.000". Se guarda solo el número
 * (sin decimales, porque el guaraní no los usa) y se muestra con separadores,
 * que es como se cuenta la plata en el cajón. Leer "3080000" es la forma más
 * fácil de equivocarse por un cero.
 */
function soloDigitos(v: string): string {
  return v.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}
function conMiles(digitos: string): string {
  return digitos === "" ? "" : Number(digitos).toLocaleString("es-PY");
}

// ── Cifras ────────────────────────────────────────────────────────────────────

/**
 * Una columna de la tira de cifras.
 *
 * Van en una sola tira con separadores y no en tarjetas sueltas: son las cifras
 * de UNA caja y se leen de corrido —cuánto abrió, cuánto entró por cada medio,
 * cuánto tiene que haber— no como seis datos independientes.
 */
function Cifra({
  label,
  valor,
  icono: Icono,
  destacado,
}: {
  label: string;
  valor: string;
  icono: React.ComponentType<{ className?: string }>;
  destacado?: boolean;
}) {
  return (
    <div className={`min-w-0 px-4 py-3.5 ${destacado ? "bg-[#4FAEB2]/8" : ""}`}>
      <p className="flex items-start gap-1.5 text-[10px] font-semibold uppercase leading-tight tracking-[0.08em] text-slate-500">
        <Icono className="mt-px h-3 w-3 shrink-0" />
        <span>{label}</span>
      </p>
      <p
        className={`mt-1 whitespace-nowrap text-lg font-bold tabular-nums tracking-tight ${
          destacado ? "text-[#3F8E91]" : "text-slate-900"
        }`}
      >
        {valor}
      </p>
    </div>
  );
}

// ── Movimientos manuales ──────────────────────────────────────────────────────

function ListaMovimientos({ movimientos }: { movimientos: MovimientoManualCaja[] }) {
  if (movimientos.length === 0) return null;
  return (
    <div className="border-t border-slate-100 px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        Movimientos manuales
      </p>
      <ul className="mt-2 space-y-1.5">
        {movimientos.map((m, i) => {
          const salida = esSalida(m.tipo);
          return (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span
                aria-hidden="true"
                className={salida ? "text-red-500" : "text-emerald-600"}
              >
                {salida ? "−" : "+"}
              </span>
              <span className="min-w-0 flex-1 break-words">
                <span className="font-medium text-slate-700">{m.concepto}</span>
                <span className="text-slate-400"> · {m.label}</span>
              </span>
              <span
                className={`shrink-0 font-semibold tabular-nums ${
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
    </div>
  );
}

// ── Modal: registrar movimiento ───────────────────────────────────────────────

const TIPOS: { valor: TipoMovimientoCaja; etiqueta: string }[] = [
  { valor: "ingreso", etiqueta: "Ingreso" },
  { valor: "egreso", etiqueta: "Egreso" },
  { valor: "retiro", etiqueta: "Retiro" },
  { valor: "ajuste", etiqueta: "Ajuste" },
];

const CAMPO =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/30";
const ETIQUETA = "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500";

function ModalMovimiento({
  cajaId,
  onListo,
  onCancelar,
}: {
  cajaId: string;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoMovimientoCaja>("ingreso");
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
    <ModalCaja
      titulo="Registrar movimiento"
      subtitulo="Ingresos/egresos manuales de la caja (no son ventas)."
      onCerrar={onCancelar}
      pie={
        <>
          <button
            type="button"
            onClick={onCancelar}
            className="h-11 rounded-lg px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || !listo}
            className="h-11 rounded-lg px-6 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: TEAL }}
          >
            {guardando ? "Guardando…" : "Registrar"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <span className={ETIQUETA}>Tipo</span>
          {/* Botones y no una lista desplegable: son cuatro y se eligen de un
              toque, que en el mostrador es lo que se necesita. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TIPOS.map((t) => {
              const activo = tipo === t.valor;
              return (
                <button
                  key={t.valor}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => setTipo(t.valor)}
                  className={`h-11 rounded-lg border text-sm font-semibold transition-colors ${
                    activo
                      ? "border-transparent text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                  style={activo ? { backgroundColor: TEAL } : undefined}
                >
                  {t.etiqueta}
                </button>
              );
            })}
          </div>
        </div>

        <label className="block">
          <span className={ETIQUETA}>Concepto</span>
          <input
            value={concepto}
            onChange={(e) => {
              setError(null);
              setConcepto(e.target.value);
            }}
            placeholder="Ej: Pago de delivery, Vuelto, etc."
            className={CAMPO}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={ETIQUETA}>Monto (Gs.)</span>
            <input
              inputMode="numeric"
              value={conMiles(monto)}
              onChange={(e) => {
                setError(null);
                setMonto(soloDigitos(e.target.value));
              }}
              placeholder="0"
              className={`${CAMPO} tabular-nums`}
            />
          </label>
          <label className="block">
            <span className={ETIQUETA}>Medio de pago</span>
            <select value={medio} onChange={(e) => setMedio(e.target.value)} className={CAMPO}>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="cheque">Cheque</option>
              <option value="otro">Otro</option>
            </select>
          </label>
        </div>

        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </ModalCaja>
  );
}

// ── Modal: cerrar caja ────────────────────────────────────────────────────────

function FilaDesglose({
  label,
  valor,
  tenue,
  destacado,
}: {
  label: string;
  valor: string;
  tenue?: boolean;
  destacado?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${
        destacado ? "border-t border-slate-200 pt-2.5" : ""
      }`}
    >
      <span className={`text-sm ${tenue ? "text-slate-400" : destacado ? "font-semibold text-slate-800" : "text-slate-600"}`}>
        {label}
      </span>
      <span
        className={`shrink-0 tabular-nums ${
          destacado
            ? "text-base font-bold text-[#3F8E91]"
            : tenue
              ? "text-sm text-slate-400"
              : "text-sm text-slate-700"
        }`}
      >
        {valor}
      </span>
    </div>
  );
}

function ModalCierre({
  cajaId,
  detalle,
  apertura,
  esperado,
  movimientos,
  onListo,
  onCancelar,
}: {
  cajaId: string;
  detalle: ArqueoCaja | null;
  apertura: number;
  esperado: number;
  movimientos: MovimientoManualCaja[];
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [monto, setMonto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valor = Number(monto);
  const valido = monto.trim() !== "" && Number.isFinite(valor) && valor >= 0;
  const diferencia = valido ? valor - esperado : 0;

  const ventasEfectivo = porMedio(detalle, "efectivo");
  const cantEfectivo = cantidadPorMedio(detalle, "efectivo");
  const ventasTransfer = porMedio(detalle, "transferencia");
  const ventasTarjeta = porMedio(detalle, "tarjeta");
  const egresos = egresosEfectivo(movimientos);

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
    <ModalCaja
      titulo="Cerrar caja"
      subtitulo="Contá el efectivo en mano. El sistema calcula la diferencia."
      onCerrar={onCancelar}
      pie={
        <>
          <button
            type="button"
            onClick={onCancelar}
            className="h-11 rounded-lg px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="h-11 rounded-lg bg-red-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-40"
          >
            {guardando ? "Cerrando…" : "Cerrar caja"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* De dónde sale el efectivo esperado. Sin esto el número es un dato que
            hay que creer; con esto se puede discutir dónde no cuadra. */}
        <div className="space-y-2 rounded-xl bg-slate-50 p-4">
          <FilaDesglose label="Apertura" valor={gs(apertura)} />
          <FilaDesglose
            label={`Ventas efectivo${cantEfectivo > 0 ? ` (${cantEfectivo})` : ""}`}
            valor={gs(ventasEfectivo)}
          />
          {ventasTransfer > 0 ? (
            <FilaDesglose
              label="Ventas transferencia (no suma)"
              valor={gs(ventasTransfer)}
              tenue
            />
          ) : null}
          {ventasTarjeta > 0 ? (
            <FilaDesglose label="Ventas tarjeta (no suma)" valor={gs(ventasTarjeta)} tenue />
          ) : null}
          {egresos > 0 ? (
            <FilaDesglose label="− Egresos manuales" valor={`-${gs(egresos)}`} />
          ) : null}
          <FilaDesglose label="Efectivo esperado" valor={gs(esperado)} destacado />
        </div>

        <label className="block">
          <span className={ETIQUETA}>Efectivo contado (Gs.)</span>
          <input
            autoFocus
            inputMode="numeric"
            value={conMiles(monto)}
            onChange={(e) => {
              setError(null);
              setMonto(soloDigitos(e.target.value));
            }}
            placeholder="0"
            className={`${CAMPO} tabular-nums`}
          />
        </label>

        {valido ? (
          <div
            className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 ${
              diferencia === 0
                ? "border-emerald-200 bg-emerald-50"
                : diferencia < 0
                  ? "border-red-200 bg-red-50"
                  : "border-amber-200 bg-amber-50"
            }`}
          >
            <span
              className={`flex items-center gap-1.5 text-sm font-medium ${
                diferencia === 0
                  ? "text-emerald-700"
                  : diferencia < 0
                    ? "text-red-700"
                    : "text-amber-700"
              }`}
            >
              {diferencia === 0 ? <Check className="h-4 w-4" /> : null}
              Diferencia
            </span>
            <span
              className={`text-lg font-bold tabular-nums ${
                diferencia === 0
                  ? "text-emerald-700"
                  : diferencia < 0
                    ? "text-red-700"
                    : "text-amber-700"
              }`}
            >
              {diferencia > 0 ? "+" : ""}
              {gs(diferencia)}
            </span>
          </div>
        ) : null}

        <p className="text-xs text-slate-500">
          La diferencia se guarda y no bloquea el cierre: lo que importa es que quede registrada.
        </p>

        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </ModalCaja>
  );
}

// ── Tarjeta ───────────────────────────────────────────────────────────────────

/**
 * La caja del día con sus números abiertos.
 *
 * Mientras la caja está abierta lo que importa no es cuánto se facturó sino
 * cuánto tiene que haber en el cajón: por eso la cifra destacada es el efectivo
 * esperado y debajo están los movimientos que lo explican. El total del día ya
 * lo cuenta el arqueo; repetirlo acá arriba solo tapaba esto.
 */
export default function TarjetaCajaAbierta() {
  const { caja, disponible, mutate: recargarCaja } = useCajaAbierta();
  const { arqueo, mutate: recargarArqueo } = useArqueo();
  const [modal, setModal] = useState<"ninguno" | "movimiento" | "cierre">("ninguno");

  function refrescar() {
    setModal("ninguno");
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
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
        <Wallet className="h-4 w-4 text-[#4FAEB2]" />
        Caja abierta
      </h2>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4FAEB2]/12 text-[#3F8E91]"
            >
              <Wallet className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-slate-900">
                  Caja {caja.numero_caja}
                </h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Abierta
                </span>
              </div>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                <Clock className="h-3 w-3 shrink-0" />
                Abierta el {fechaLarga(caja.fecha_apertura)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setModal("movimiento")}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" />
              Movimiento
            </button>
            <button
              type="button"
              onClick={() => setModal("cierre")}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700"
            >
              <Lock className="h-4 w-4" />
              Cerrar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 border-t border-slate-100 sm:grid-cols-3 sm:divide-y-0 xl:grid-cols-6">
          <Cifra label="Apertura" valor={gs(apertura)} icono={Wallet} />
          <Cifra label="Ventas" valor={String(detalle?.ingresos.por_medio.reduce((s, m) => s + m.cantidad, 0) ?? 0)} icono={Check} />
          <Cifra label="Efectivo" valor={gs(porMedio(detalle, "efectivo"))} icono={ArrowDownLeft} />
          <Cifra label="Transfer" valor={gs(porMedio(detalle, "transferencia"))} icono={Landmark} />
          <Cifra label="Tarjeta" valor={gs(porMedio(detalle, "tarjeta"))} icono={CreditCard} />
          <Cifra label="Esperado efectivo" valor={gs(esperado)} icono={Wallet} destacado />
        </div>

        <ListaMovimientos movimientos={movimientos} />

        {ventas === 0 && movimientos.length === 0 ? (
          <p className="border-t border-slate-100 px-5 py-4 text-xs text-slate-400">
            Todavía no se cobró nada en esta caja. Lo que salga del cajón —combustible,
            adelantos— cargalo como movimiento para que el cierre no quede con una diferencia
            sin explicar.
          </p>
        ) : null}
      </div>

      {modal === "movimiento" ? (
        <ModalMovimiento
          cajaId={caja.id}
          onListo={refrescar}
          onCancelar={() => setModal("ninguno")}
        />
      ) : null}

      {modal === "cierre" ? (
        <ModalCierre
          cajaId={caja.id}
          detalle={detalle}
          apertura={apertura}
          esperado={esperado}
          movimientos={movimientos}
          onListo={refrescar}
          onCancelar={() => setModal("ninguno")}
        />
      ) : null}
    </section>
  );
}
