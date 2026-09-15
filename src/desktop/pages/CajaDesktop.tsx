"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Landmark,
  Minus,
  Plus,
  Receipt,
  Search,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useClientes } from "@/shared/hooks/useClientes";
import { useProductos } from "@/shared/hooks/useInventario";
import { clienteNombre } from "@/lib/clientes/storage";
import { formatGs, useCajaVenta, type CajaVenta } from "@/shared/caja/useCajaVenta";
import SelectorReparto from "@/shared/caja/SelectorReparto";
import { FORMAS_PAGO, type FormaPagoVenta, type TipoIvaVenta } from "@/lib/ventas/types";

/**
 * Caja desktop. Misma lógica que la mobile (`useCajaVenta`), otro layout.
 *
 * En un escritorio no hay razón para partir el cobro en pasos: el catálogo va a
 * la izquierda y el carrito, los totales y el pago quedan fijos a la derecha,
 * siempre a la vista. El cajero ve el total mientras carga productos, que es lo
 * que se pierde con un asistente.
 */

const TEAL = "#4FAEB2";
const IVAS: TipoIvaVenta[] = ["10%", "5%", "EXENTA"];

const ICONOS_PAGO: Record<FormaPagoVenta, React.ComponentType<{ className?: string }>> = {
  efectivo: Banknote,
  transferencia: Landmark,
  cheque: Receipt,
  credito: CreditCard,
};

export default function CajaDesktop() {
  const caja = useCajaVenta();

  if (caja.paso === "listo" && caja.ventaCreada) {
    return <Comprobante caja={caja} />;
  }

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <header className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Caja</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Cargá los productos y cobrá sin salir de esta pantalla.
          </p>
        </div>
        <Link
          href="/ventas"
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          Ver ventas
        </Link>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Catalogo caja={caja} />
        <PanelCobro caja={caja} />
      </div>
    </div>
  );
}

// ── Columna izquierda: catálogo ──────────────────────────────────────────────

function Catalogo({ caja }: { caja: CajaVenta }) {
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
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar producto por nombre o SKU…"
          className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
        />
      </div>

      {isLoading ? (
        <p className="py-16 text-center text-sm text-slate-400">Cargando productos…</p>
      ) : filtrados.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-400">
          {query ? `Ningún producto coincide con “${query}”.` : "No hay productos con stock."}
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((p) => {
            const cantidad = caja.cantidadDe(p.id);
            return (
              <li
                key={p.id}
                className={`flex flex-col rounded-xl border p-3 transition-colors ${
                  cantidad > 0 ? "border-[#4FAEB2] bg-[#4FAEB2]/5" : "border-slate-200"
                }`}
              >
                <p className="line-clamp-2 text-sm font-semibold text-slate-900">{p.nombre}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Stock: {p.stock_actual} {p.unidad_medida}
                </p>
                <p className="mt-1 text-base font-bold text-[#4FAEB2]">
                  {formatGs(p.precio_venta)}
                </p>

                <div className="mt-3 flex items-center gap-2">
                  {cantidad > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => caja.cambiarCantidad(p, -1)}
                        aria-label={`Quitar una unidad de ${p.nombre}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <input
                        inputMode="numeric"
                        value={cantidad}
                        onChange={(e) => caja.fijarCantidad(p, Number(e.target.value))}
                        aria-label={`Cantidad de ${p.nombre}`}
                        className="h-8 w-14 rounded-lg border border-slate-200 text-center text-sm font-bold tabular-nums outline-none focus:ring-2 focus:ring-[#4FAEB2]"
                      />
                      <button
                        type="button"
                        onClick={() => caja.cambiarCantidad(p, 1)}
                        disabled={cantidad >= p.stock_actual}
                        aria-label={`Agregar una unidad de ${p.nombre}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-white disabled:opacity-30"
                        style={{ backgroundColor: TEAL }}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => caja.cambiarCantidad(p, 1)}
                      className="flex-1 rounded-lg py-2 text-xs font-semibold text-white"
                      style={{ backgroundColor: TEAL }}
                    >
                      Agregar
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── Columna derecha: cliente, carrito, totales y pago ────────────────────────

function PanelCobro({ caja }: { caja: CajaVenta }) {
  return (
    <aside className="lg:sticky lg:top-6 lg:self-start">
      <div className="flex max-h-[calc(100vh-7rem)] flex-col rounded-2xl border border-slate-200 bg-white">
        <SelectorCliente caja={caja} />

        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {caja.carrito.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              Agregá productos desde el catálogo.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {caja.carrito.map((item) => {
                const linea = caja.lineas.find((l) => l.producto_id === item.producto.id);
                return (
                  <li key={item.producto.id} className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                        {item.producto.nombre}
                      </p>
                      <button
                        type="button"
                        onClick={() => caja.quitarItem(item.producto.id)}
                        aria-label={`Quitar ${item.producto.nombre} de la venta`}
                        className="shrink-0 rounded p-1 text-slate-300 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500">
                        {item.cantidad} × {formatGs(item.producto.precio_venta)}
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-slate-900">
                        {formatGs(linea?.total_linea ?? 0)}
                      </span>
                    </div>
                    <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                      IVA
                      <select
                        value={item.tipoIva}
                        onChange={(e) =>
                          caja.cambiarIva(item.producto.id, e.target.value as TipoIvaVenta)
                        }
                        aria-label={`IVA de ${item.producto.nombre}`}
                        className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px]"
                      >
                        {IVAS.map((iva) => (
                          <option key={iva} value={iva}>
                            {iva}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-100 p-5">
          <div className="flex items-center justify-between py-0.5">
            <span className="text-sm text-slate-500">Subtotal</span>
            <span className="text-sm tabular-nums text-slate-700">
              {formatGs(caja.totales.subtotal)}
            </span>
          </div>
          <div className="flex items-center justify-between py-0.5">
            <span className="text-sm text-slate-500">IVA</span>
            <span className="text-sm tabular-nums text-slate-700">
              {formatGs(caja.totales.montoIva)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
            <span className="text-sm font-semibold text-slate-900">Total</span>
            <span className="text-2xl font-bold tabular-nums text-slate-900">
              {formatGs(caja.totales.total)}
            </span>
          </div>

          <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-widest text-slate-400">
            Forma de pago
          </p>
          <div className="grid grid-cols-2 gap-2">
            {FORMAS_PAGO.map(({ value: f, label }) => {
              const Icono = ICONOS_PAGO[f];
              const deshabilitado = f === "credito" && !caja.creditoDisponible;
              const elegido = caja.formaPago === f;
              return (
                <button
                  key={f}
                  type="button"
                  disabled={deshabilitado}
                  onClick={() => caja.setFormaPago(f)}
                  title={deshabilitado ? "Solo para clientes identificados" : undefined}
                  className={`flex items-center gap-2 rounded-lg border-2 px-2.5 py-2 text-xs font-medium transition-colors disabled:opacity-40 ${
                    elegido
                      ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-slate-900"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icono className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>

          {caja.formaPago === "credito" ? (
            <label className="mt-2 block">
              <span className="mb-1 block text-xs text-slate-500">Plazo en días</span>
              <input
                inputMode="numeric"
                value={caja.plazoDias}
                onChange={(e) => caja.setPlazoDias(e.target.value)}
                placeholder="30"
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
              />
            </label>
          ) : null}

          {caja.repartosAbiertos.length > 0 ? (
            <div className="mt-3">
              <SelectorReparto caja={caja} />
            </div>
          ) : null}

          <OpcionesMoneda caja={caja} />

          {caja.error ? (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
              {caja.error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={caja.confirmar}
            disabled={!caja.puedeConfirmar || caja.guardando}
            className="mt-3 w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: TEAL }}
          >
            {caja.guardando ? "Guardando…" : "Confirmar venta"}
          </button>
        </div>
      </div>
    </aside>
  );
}

function OpcionesMoneda({ caja }: { caja: CajaVenta }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="text-xs font-medium text-slate-500 underline-offset-2 hover:underline"
      >
        {abierto ? "Ocultar moneda" : `Moneda: ${caja.moneda}`}
      </button>

      {abierto ? (
        <div className="mt-2 rounded-lg border border-slate-200 p-3">
          <div className="flex overflow-hidden rounded-lg border border-slate-200">
            {(["GS", "USD"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => caja.setMoneda(m)}
                className={`flex-1 py-1.5 text-xs font-medium ${
                  caja.moneda === m ? "text-white" : "bg-white text-slate-600"
                }`}
                style={caja.moneda === m ? { backgroundColor: TEAL } : undefined}
              >
                {m}
              </button>
            ))}
          </div>
          {caja.moneda === "USD" ? (
            <input
              inputMode="decimal"
              value={caja.tipoCambio}
              onChange={(e) => caja.setTipoCambio(e.target.value)}
              placeholder="Tipo de cambio (7300)"
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Cliente ──────────────────────────────────────────────────────────────────

function SelectorCliente({ caja }: { caja: CajaVenta }) {
  const { clientes } = useClientes();
  const [abierto, setAbierto] = useState(false);
  const [query, setQuery] = useState("");

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clientes.slice(0, 30);
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
      .slice(0, 30);
  }, [clientes, query]);

  return (
    <div className="border-b border-slate-100 p-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
        Cliente
      </p>

      {abierto ? (
        <div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar cliente…"
              className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-8 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            />
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar buscador de clientes"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="mt-2 max-h-56 overflow-y-auto">
            {filtrados.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    caja.elegirCliente(c);
                    setAbierto(false);
                    setQuery("");
                  }}
                  className="w-full rounded-lg px-2 py-2 text-left hover:bg-slate-50"
                >
                  <span className="block truncate text-sm text-slate-900">{clienteNombre(c)}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {c.ruc || c.documento || c.codigo_cliente}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border-2 px-3 py-2 text-left transition-colors ${
              caja.cliente ? "border-[#4FAEB2]" : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            <User className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate text-sm text-slate-900">
              {caja.cliente ? clienteNombre(caja.cliente) : "Identificar cliente"}
            </span>
          </button>
          <button
            type="button"
            onClick={caja.elegirSinNombre}
            className={`shrink-0 rounded-lg border-2 px-3 py-2 text-xs font-medium transition-colors ${
              caja.sinNombre
                ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-slate-900"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Sin nombre
          </button>
        </div>
      )}
    </div>
  );
}

// ── Comprobante ──────────────────────────────────────────────────────────────

function Comprobante({ caja }: { caja: CajaVenta }) {
  const venta = caja.ventaCreada!;
  const fecha = new Date(venta.fecha);

  return (
    <div className="mx-auto max-w-lg p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-9 w-9 text-emerald-500" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-900">¡Venta registrada!</h1>

        <dl className="mt-6 space-y-2 text-left">
          <Dato label="N.° de venta" valor={venta.numero_control} />
          <Dato
            label="Fecha y hora"
            valor={`${fecha.toLocaleDateString("es-PY")} ${fecha.toLocaleTimeString("es-PY", {
              hour: "2-digit",
              minute: "2-digit",
            })}`}
          />
          <Dato label="Cliente" valor={caja.nombreCliente} />
          <Dato
            label="Forma de pago"
            valor={FORMAS_PAGO.find((f) => f.value === caja.formaPago)?.label ?? "—"}
          />
          <div className="flex items-center justify-between border-t border-slate-100 pt-2">
            <dt className="text-sm font-semibold text-slate-900">Total</dt>
            <dd className="text-2xl font-bold tabular-nums text-slate-900">
              {formatGs(venta.total)}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex gap-2">
          <Link
            href="/ventas/arqueo"
            className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Ver arqueo
          </Link>
          <button
            type="button"
            onClick={caja.reiniciar}
            className="flex-1 rounded-xl py-3 text-sm font-semibold text-white"
            style={{ backgroundColor: TEAL }}
          >
            Nueva venta
          </button>
        </div>
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
