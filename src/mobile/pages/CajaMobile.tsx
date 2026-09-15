"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FileText,
  Landmark,
  Minus,
  Plus,
  Receipt,
  Search,
  User,
  Wallet,
} from "lucide-react";
import { useClientes } from "@/shared/hooks/useClientes";
import { useProductos } from "@/shared/hooks/useInventario";
import { clienteNombre } from "@/lib/clientes/storage";
import { formatGs, PASOS_CAJA, useCajaVenta, type CajaVenta } from "@/shared/caja/useCajaVenta";
import SelectorReparto from "@/shared/caja/SelectorReparto";
import { METODOS_PAGO, type MetodoPagoVenta, type TipoIvaVenta } from "@/lib/ventas/types";

/**
 * Caja mobile: asistente de cobro a pantalla completa.
 *
 *   Cliente → Productos → Resumen → Pago → Comprobante
 *
 * Cada paso ocupa la pantalla entera con una barra de acción fija abajo, que es
 * donde llega el pulgar. El stepper de arriba deja volver a un paso ya hecho sin
 * perder el carrito.
 *
 * Paleta Zentra: `--zentra-sidebar` (#0B3A3D) para las superficies oscuras y
 * #4FAEB2 para las acciones, que es el acento que ya usa el resto del ERP.
 */

const TEAL = "#4FAEB2";
const TEAL_OSCURO = "#3F8E91";

export default function CajaMobile() {
  const caja = useCajaVenta();

  if (caja.paso === "listo" && caja.ventaCreada) {
    return <Comprobante caja={caja} />;
  }


  return (
    <div className="flex min-h-full flex-col bg-[#F8FAFC]">
      <Encabezado caja={caja} />

      {/* pb generoso: la barra de acción es fija y taparía los últimos ítems. */}
      <div className="flex-1 px-4 pb-44">
        {caja.paso === "cliente" ? <PasoCliente caja={caja} /> : null}
        {caja.paso === "productos" ? <PasoProductos caja={caja} /> : null}
        {caja.paso === "resumen" ? <PasoResumen caja={caja} /> : null}
        {caja.paso === "pago" ? <PasoPago caja={caja} /> : null}
      </div>

      <BarraAccion caja={caja} />
    </div>
  );
}

// ── Encabezado con stepper ───────────────────────────────────────────────────

function Encabezado({ caja }: { caja: CajaVenta }) {
  const indiceActual = PASOS_CAJA.findIndex((p) => p.id === caja.paso);

  return (
    <header className="sticky top-0 z-10 bg-[var(--zentra-sidebar)] px-4 pb-4 pt-3 text-white">
      <div className="flex items-center gap-2">
        {caja.paso === "cliente" ? (
          <Link
            href="/ventas"
            aria-label="Salir de la caja"
            className="-ml-1 rounded-lg p-1.5 active:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={caja.volver}
            aria-label="Paso anterior"
            className="-ml-1 rounded-lg p-1.5 active:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <h1 className="text-base font-semibold">Nueva venta</h1>
      </div>

      {/* Stepper: los pasos ya completados vuelven a ser tocables. */}
      <ol className="mt-3 flex items-center gap-1.5">
        {PASOS_CAJA.map((p, i) => {
          const completado = i < indiceActual;
          const actual = i === indiceActual;
          return (
            <li key={p.id} className="flex flex-1 flex-col items-center gap-1">
              <button
                type="button"
                disabled={!completado}
                onClick={() => caja.irA(p.id)}
                aria-current={actual ? "step" : undefined}
                aria-label={`Paso ${i + 1}: ${p.label}`}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  actual
                    ? "bg-[#7DCFD2] text-[#0B3A3D]"
                    : completado
                      ? "bg-white/25 text-white"
                      : "bg-white/10 text-white/50"
                }`}
              >
                {completado ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </button>
              <span
                className={`text-[10px] ${actual ? "font-semibold text-white" : "text-white/60"}`}
              >
                {p.label}
              </span>
            </li>
          );
        })}
      </ol>

      {/* A partir del paso 2 el cliente ya está definido: se muestra como contexto. */}
      {caja.paso !== "cliente" ? (
        <p className="mt-3 truncate rounded-lg bg-white/10 px-3 py-1.5 text-xs">
          Cliente: <span className="font-semibold">{caja.nombreCliente}</span>
        </p>
      ) : null}
    </header>
  );
}

// ── Paso 1: cliente ──────────────────────────────────────────────────────────

function PasoCliente({ caja }: { caja: CajaVenta }) {
  const { clientes, isLoading } = useClientes();
  const [query, setQuery] = useState("");
  const [eligiendo, setEligiendo] = useState(false);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clientes.slice(0, 40);
    return clientes
      .filter((c) => {
        const nombre = clienteNombre(c).toLowerCase();
        return (
          nombre.includes(q) ||
          (c.ruc ?? "").toLowerCase().includes(q) ||
          (c.documento ?? "").toLowerCase().includes(q) ||
          c.codigo_cliente.toLowerCase().includes(q)
        );
      })
      .slice(0, 40);
  }, [clientes, query]);

  if (eligiendo) {
    return (
      <div className="pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, RUC o código"
            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          />
        </div>

        {isLoading ? (
          <p className="mt-6 text-center text-sm text-slate-400">Cargando clientes…</p>
        ) : filtrados.length === 0 ? (
          <p className="mt-6 text-center text-sm text-slate-400">
            Ningún cliente coincide con “{query}”.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {filtrados.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    caja.elegirCliente(c);
                    setEligiendo(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left active:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      {clienteNombre(c)}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {c.ruc || c.documento || c.codigo_cliente}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => setEligiendo(false)}
          className="mt-4 w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-600"
        >
          Cancelar
        </button>
      </div>
    );
  }

  const identificado = caja.cliente !== null;

  return (
    <div className="pt-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
        Tipo de cliente
      </p>

      <button
        type="button"
        onClick={() => setEligiendo(true)}
        className={`flex w-full items-center gap-3 rounded-xl border-2 bg-white p-4 text-left transition-colors ${
          identificado ? "border-[#4FAEB2]" : "border-slate-200"
        }`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#4FAEB2]/10 text-[#4FAEB2]">
          <User className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-900">Cliente identificado</span>
          <span className="block truncate text-xs text-slate-500">
            {identificado ? clienteNombre(caja.cliente!) : "Seleccionar de la lista"}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
      </button>

      <button
        type="button"
        onClick={caja.elegirSinNombre}
        className={`mt-3 flex w-full items-center gap-3 rounded-xl border-2 bg-white p-4 text-left transition-colors ${
          caja.sinNombre ? "border-[#4FAEB2]" : "border-slate-200"
        }`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <FileText className="h-5 w-5" />
        </span>
        <span className="flex-1 text-sm font-semibold text-slate-900">Sin nombre</span>
        <span
          className={`h-4 w-4 shrink-0 rounded-full border-2 ${
            caja.sinNombre ? "border-[#4FAEB2] bg-[#4FAEB2]" : "border-slate-300"
          }`}
        />
      </button>

      {caja.sinNombre ? (
        <p className="mt-3 rounded-lg bg-sky-50 p-3 text-xs leading-relaxed text-sky-800">
          Se generará una factura sin nombre según normativa vigente. El crédito no está
          disponible para ventas sin cliente identificado.
        </p>
      ) : null}
    </div>
  );
}

// ── Paso 2: productos ────────────────────────────────────────────────────────

function PasoProductos({ caja }: { caja: CajaVenta }) {
  const { productos, isLoading } = useProductos();
  const [query, setQuery] = useState("");

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = productos.filter((p) => p.stock_actual > 0 || caja.cantidadDe(p.id) > 0);
    if (!q) return base;
    return base.filter(
      (p) => p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  }, [productos, query, caja]);

  return (
    <div className="pt-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar producto…"
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
        />
      </div>

      {isLoading ? (
        <p className="mt-6 text-center text-sm text-slate-400">Cargando productos…</p>
      ) : filtrados.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-400">
          {query ? `Ningún producto coincide con “${query}”.` : "No hay productos con stock."}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {filtrados.map((p) => {
            const cantidad = caja.cantidadDe(p.id);
            const sinStock = cantidad >= p.stock_actual;
            return (
              <li
                key={p.id}
                className={`flex items-center gap-3 rounded-xl border bg-white p-3 ${
                  cantidad > 0 ? "border-[#4FAEB2]" : "border-slate-200"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{p.nombre}</p>
                  <p className="text-xs text-slate-500">
                    Stock: {p.stock_actual} {p.unidad_medida}
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-[#4FAEB2]">
                    {formatGs(p.precio_venta)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => caja.cambiarCantidad(p, -1)}
                    disabled={cantidad === 0}
                    aria-label={`Quitar una unidad de ${p.nombre}`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-7 text-center text-sm font-bold tabular-nums text-slate-900">
                    {cantidad}
                  </span>
                  <button
                    type="button"
                    onClick={() => caja.cambiarCantidad(p, 1)}
                    disabled={sinStock}
                    aria-label={`Agregar una unidad de ${p.nombre}`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-white disabled:opacity-30"
                    style={{ backgroundColor: TEAL }}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Paso 3: resumen ──────────────────────────────────────────────────────────

const IVAS: TipoIvaVenta[] = ["10%", "5%", "EXENTA"];

function PasoResumen({ caja }: { caja: CajaVenta }) {
  const [opciones, setOpciones] = useState(false);

  return (
    <div className="pt-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
        Resumen de venta
      </p>

      <ul className="space-y-2">
        {caja.carrito.map((item) => {
          const linea = caja.lineas.find((l) => l.producto_id === item.producto.id);
          return (
            <li key={item.producto.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {item.producto.nombre}
                  </p>
                  <p className="text-xs text-slate-500">
                    {item.cantidad} × {formatGs(item.producto.precio_venta)}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-bold tabular-nums text-slate-900">
                  {formatGs(linea?.total_linea ?? 0)}
                </p>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => caja.cambiarCantidad(item.producto, -1)}
                    aria-label={`Quitar una unidad de ${item.producto.nombre}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center text-xs font-bold tabular-nums">
                    {item.cantidad}
                  </span>
                  <button
                    type="button"
                    onClick={() => caja.cambiarCantidad(item.producto, 1)}
                    disabled={item.cantidad >= item.producto.stock_actual}
                    aria-label={`Agregar una unidad de ${item.producto.nombre}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-white disabled:opacity-30"
                    style={{ backgroundColor: TEAL }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  IVA
                  <select
                    value={item.tipoIva}
                    onChange={(e) =>
                      caja.cambiarIva(item.producto.id, e.target.value as TipoIvaVenta)
                    }
                    aria-label={`IVA de ${item.producto.nombre}`}
                    className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs"
                  >
                    {IVAS.map((iva) => (
                      <option key={iva} value={iva}>
                        {iva}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <Fila label="Subtotal" valor={formatGs(caja.totales.subtotal)} />
        <Fila label="IVA" valor={formatGs(caja.totales.montoIva)} />
        <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
          <span className="text-sm font-semibold text-slate-900">Total</span>
          <span className="text-xl font-bold tabular-nums text-slate-900">
            {formatGs(caja.totales.total)}
          </span>
        </div>
      </div>

      {/* Moneda y tipo de cambio quedan acá: la venta en guaraníes, que es casi
          todas, no tiene que ver un campo extra para nada. */}
      <button
        type="button"
        onClick={() => setOpciones((v) => !v)}
        className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-xs font-medium text-slate-600"
      >
        {opciones ? "Ocultar" : "Moneda y tipo de cambio"}
      </button>

      {opciones ? (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex overflow-hidden rounded-lg border border-slate-200">
            {(["GS", "USD"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => caja.setMoneda(m)}
                className={`flex-1 py-2 text-sm font-medium ${
                  caja.moneda === m ? "text-white" : "bg-white text-slate-600"
                }`}
                style={caja.moneda === m ? { backgroundColor: TEAL } : undefined}
              >
                {m}
              </button>
            ))}
          </div>
          {caja.moneda === "USD" ? (
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Tipo de cambio</span>
              <input
                inputMode="decimal"
                value={caja.tipoCambio}
                onChange={(e) => caja.setTipoCambio(e.target.value)}
                placeholder="7300"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
              />
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm tabular-nums text-slate-700">{valor}</span>
    </div>
  );
}

// ── Paso 4: forma de pago ────────────────────────────────────────────────────

const ICONOS_PAGO: Record<MetodoPagoVenta, React.ComponentType<{ className?: string }>> = {
  efectivo: Banknote,
  tarjeta: CreditCard,
  transferencia: Landmark,
  cheque: Receipt,
  mixto: Wallet,
};

function PasoPago({ caja }: { caja: CajaVenta }) {
  return (
    <div className="pt-4">
      {/* El crédito no es un medio de cobro: es una condición de la venta. */}
      <button
        type="button"
        disabled={!caja.creditoDisponible}
        onClick={() => caja.setACredito(!caja.aCredito)}
        className={`mb-4 flex w-full items-center gap-3 rounded-xl border-2 bg-white p-4 text-left transition-colors disabled:opacity-50 ${
          caja.aCredito ? "border-[#4FAEB2] bg-[#4FAEB2]/5" : "border-slate-200"
        }`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <CalendarClock className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-900">Venta a crédito</span>
          <span className="block text-xs text-slate-500">
            {caja.creditoDisponible
              ? "Se cobra después; no entra plata a la caja ahora"
              : "Solo para clientes identificados"}
          </span>
        </span>
        <span
          className={`h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors ${
            caja.aCredito ? "bg-[#4FAEB2]" : "bg-slate-200"
          }`}
        >
          <span
            className={`block h-4 w-4 rounded-full bg-white transition-transform ${
              caja.aCredito ? "translate-x-4" : ""
            }`}
          />
        </span>
      </button>

      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
        {caja.aCredito ? "Plazo" : "Con qué se cobra"}
      </p>

      <ul className={`space-y-2 ${caja.aCredito ? "hidden" : ""}`}>
        {METODOS_PAGO.map((o) => {
          const Icono = ICONOS_PAGO[o.value];
          const deshabilitado = false;
          const elegido = caja.metodoPago === o.value;
          return (
            <li key={o.value}>
              <button
                type="button"
                disabled={deshabilitado}
                onClick={() => caja.setMetodoPago(o.value)}
                className={`flex w-full items-center gap-3 rounded-xl border-2 bg-white p-4 text-left transition-colors disabled:opacity-50 ${
                  elegido ? "border-[#4FAEB2] bg-[#4FAEB2]/5" : "border-slate-200"
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <Icono className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">{o.label}</span>
                </span>
                {elegido ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-[#4FAEB2]" />
                ) : (
                  <span className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-300" />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {caja.aCredito ? (
        <label className="block rounded-xl border border-slate-200 bg-white p-4">
          <span className="mb-1 block text-xs font-medium text-slate-600">Plazo en días</span>
          <input
            inputMode="numeric"
            value={caja.plazoDias}
            onChange={(e) => caja.setPlazoDias(e.target.value)}
            placeholder="30"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          />
        </label>
      ) : null}

      <div className="mt-3">
        <SelectorReparto caja={caja} />
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          Total a cobrar
        </p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
          {formatGs(caja.totales.total)}
        </p>
      </div>
    </div>
  );
}

// ── Barra de acción fija ─────────────────────────────────────────────────────

function BarraAccion({ caja }: { caja: CajaVenta }) {
  const enPago = caja.paso === "pago";
  const etiqueta = enPago ? "Confirmar venta" : "Continuar";

  return (
    <div
      // Fija justo encima del BottomNav (h-14 + safe area) y opaca: con `sticky`
      // el resto de la lista se veía por debajo del botón.
      className="fixed inset-x-0 z-30 border-t border-slate-200 bg-white px-4 py-3"
      style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
    >
      {caja.error ? (
        <p role="alert" className="mb-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
          {caja.error}
        </p>
      ) : null}

      {caja.paso === "productos" && caja.totales.renglones > 0 ? (
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-slate-500">
            {caja.totales.unidades} {caja.totales.unidades === 1 ? "ítem" : "ítems"}
          </span>
          <span className="font-bold tabular-nums text-slate-900">
            {formatGs(caja.totales.total)}
          </span>
        </div>
      ) : null}

      <button
        type="button"
        onClick={enPago ? caja.confirmar : caja.siguiente}
        disabled={!caja.puedeAvanzar || caja.guardando}
        className="w-full rounded-xl py-3.5 text-sm font-semibold text-white transition-colors disabled:opacity-40"
        style={{ backgroundColor: caja.puedeAvanzar && !caja.guardando ? TEAL : TEAL_OSCURO }}
      >
        {caja.guardando ? "Guardando…" : etiqueta}
      </button>
    </div>
  );
}

// ── Comprobante ──────────────────────────────────────────────────────────────

function Comprobante({ caja }: { caja: CajaVenta }) {
  const venta = caja.ventaCreada!;
  const fecha = new Date(venta.fecha);

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-[#F8FAFC] px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-9 w-9 text-emerald-500" />
        </div>
        <h1 className="mt-4 text-lg font-bold text-slate-900">¡Venta registrada!</h1>

        <dl className="mt-5 space-y-2 text-left">
          <Dato label="N.° de venta" valor={venta.numero_control} />
          <Dato
            label="Fecha y hora"
            valor={`${fecha.toLocaleDateString("es-PY")} ${fecha.toLocaleTimeString("es-PY", {
              hour: "2-digit",
              minute: "2-digit",
            })}`}
          />
          <Dato label="Cliente" valor={caja.nombreCliente} />
          <Dato label="Cobro" valor={etiquetaCobro(caja)} />
          <div className="flex items-center justify-between border-t border-slate-100 pt-2">
            <dt className="text-sm font-semibold text-slate-900">Total</dt>
            <dd className="text-xl font-bold tabular-nums text-slate-900">
              {formatGs(venta.total)}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={caja.reiniciar}
          className="mt-6 w-full rounded-xl py-3.5 text-sm font-semibold text-white"
          style={{ backgroundColor: TEAL }}
        >
          Nueva venta
        </button>
        <Link
          href="/ventas/arqueo"
          className="mt-2 block w-full rounded-xl border border-slate-200 py-3.5 text-sm font-medium text-slate-600"
        >
          Ver arqueo del día
        </Link>
      </div>
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="truncate text-sm font-medium text-slate-900">{valor}</dd>
    </div>
  );
}

/** Cómo se cobró, en palabras: a crédito, o el medio elegido. */
function etiquetaCobro(caja: CajaVenta): string {
  if (caja.aCredito) return "A crédito";
  return METODOS_PAGO.find((m) => m.value === caja.metodoPago)?.label ?? "—";
}
