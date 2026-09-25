"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  FileText,
  Landmark,
  Receipt,
  Search,
  Share2,
  Trash2,
  User,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import { useClientes } from "@/shared/hooks/useClientes";
import { useCatalogoVenta } from "@/shared/hooks/useInventario";
import AvisoCatalogoCaja, { textoMotivoSalon } from "@/shared/caja/AvisoCatalogoCaja";
import NuevoClienteRapido from "@/shared/caja/NuevoClienteRapido";
import FacturaVenta from "@/shared/caja/FacturaVenta";
import { useEmisor } from "@/shared/hooks/useEmisor";
import { compartirComprobante } from "@/lib/ventas/compartir-comprobante";
import { esFacturaLegal, fechaHora, type DatosComprobante } from "@/lib/ventas/comprobante";
import { clienteNombre } from "@/lib/clientes/storage";
import SelectorCantidad from "@/shared/caja/SelectorCantidad";
import MiniaturaProducto from "@/components/inventario/MiniaturaProducto";
import { esPesable, formatCantidad } from "@/lib/inventario/unidades";
import { formatGs, useCajaVenta, type CajaVenta } from "@/shared/caja/useCajaVenta";
import SelectorReparto from "@/shared/caja/SelectorReparto";
import { METODOS_PAGO, type MetodoPagoVenta, type TipoIvaVenta } from "@/lib/ventas/types";

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

const ICONOS_PAGO: Record<MetodoPagoVenta, React.ComponentType<{ className?: string }>> = {
  efectivo: Banknote,
  tarjeta: CreditCard,
  transferencia: Landmark,
  cheque: Receipt,
  mixto: Wallet,
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
  // Si la venta sale de un camión, el catálogo es el stock de ese camión.
  const { productos, origen, isLoading, errorCatalogo } = useCatalogoVenta(caja.repartoId);
  const [query, setQuery] = useState("");

  // Sin stock no se ofrece, pero lo que ya está en el carrito se queda: sacarlo
  // de la lista a mitad de la venta haría desaparecer una línea ya cargada.
  const conStock = useMemo(
    () => productos.filter((p) => p.stock_actual > 0 || caja.cantidadDe(p.id) > 0),
    [productos, caja]
  );
  const ocultosSinStock = productos.length - conStock.length;

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conStock;
    return conStock.filter(
      (p) => p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  }, [conStock, query]);


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

      {errorCatalogo ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="text-sm font-semibold text-rose-700">
            No se pudo cargar la lista de productos.
          </p>
          <p className="mt-1 text-xs text-rose-600">{errorCatalogo}</p>
          <p className="mt-1 text-xs text-rose-600">
            Esto no es falta de stock: la consulta falló.
          </p>
        </div>
      ) : null}

      {isLoading ? null : (
        <AvisoCatalogoCaja origen={origen} ocultos={ocultosSinStock} />
      )}

      {isLoading ? (
        <p className="py-16 text-center text-sm text-slate-400">Cargando productos…</p>
      ) : errorCatalogo ? null : filtrados.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-400">
          {query
            ? `Ningún producto coincide con “${query}”.`
            : caja.repartoId
              ? "El camión está vacío. Cargalo desde Repartos antes de salir."
              : "No hay stock disponible para vender. Si la mercadería está arriba de un camión, se vende desde su reparto; para vender de mostrador, descargala en Repartos o cargala desde Inventario."}
              {textoMotivoSalon(origen) ? (
                <span className="mt-2 block text-slate-500">{textoMotivoSalon(origen)}</span>
              ) : null}
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
                <div className="flex items-start gap-3">
                  <MiniaturaProducto producto={p} />
                  <p className="line-clamp-2 text-sm font-semibold text-slate-900">{p.nombre}</p>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  Stock: {formatCantidad(p.stock_actual, p.unidad_medida)} {p.unidad_medida}
                </p>
                <p className="mt-1 text-base font-bold text-[#4FAEB2]">
                  {formatGs(p.precio_venta)}
                </p>

                <div className="mt-3 flex items-center gap-2">
                  {cantidad > 0 || esPesable(p.unidad_medida) ? (
                    <SelectorCantidad
                      producto={p}
                      cantidad={cantidad}
                      cambiarCantidad={caja.cambiarCantidad}
                      fijarCantidad={caja.fijarCantidad}
                    />
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
      {/* El panel se limita al alto de la pantalla para que el total quede
          siempre a la vista, y la lista de productos scrollea por dentro. Pero
          el cliente arriba y los totales abajo no se achican: en una pantalla
          baja no quedaba lugar para la lista y se recortaba a la mitad —el
          detalle de la venta desaparecía y el texto quedaba cortado por el
          medio—. Con un alto mínimo la lista ya no se aplasta, y si aun así no
          entra todo, scrollea el panel entero en vez de tapar nada. */}
      <div className="flex max-h-[calc(100vh-7rem)] flex-col overflow-y-auto rounded-2xl border border-slate-200 bg-white">
        <SelectorCliente caja={caja} />

        <div className="min-h-[7rem] flex-1 overflow-y-auto px-5">
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
                        {formatCantidad(item.cantidad, item.producto.unidad_medida)}{" "}
                        {item.producto.unidad_medida} × {formatGs(item.producto.precio_venta)}
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
            <span className="text-sm text-slate-500">IVA incluido</span>
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

          {/* El crédito no es un medio de cobro: es una condición de la venta. */}
          <label
            className={`mt-4 flex items-center gap-2.5 rounded-lg border-2 p-2.5 transition-colors ${
              caja.aCredito ? "border-[#4FAEB2] bg-[#4FAEB2]/10" : "border-slate-200"
            } ${caja.creditoDisponible ? "cursor-pointer" : "opacity-50"}`}
          >
            <input
              type="checkbox"
              disabled={!caja.creditoDisponible}
              checked={caja.aCredito}
              onChange={(e) => caja.setACredito(e.target.checked)}
              className="h-4 w-4 accent-[#4FAEB2]"
            />
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-slate-900">Venta a crédito</span>
              <span className="block text-[11px] text-slate-500">
                {caja.creditoDisponible
                  ? "No entra plata a la caja ahora"
                  : "Solo para clientes identificados"}
              </span>
            </span>
          </label>

          {!caja.aCredito ? (
            <>
              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-widest text-slate-400">
                Con qué se cobra
              </p>
              <div className="grid grid-cols-2 gap-2">
                {METODOS_PAGO.map(({ value: m, label }) => {
                  const Icono = ICONOS_PAGO[m];
                  const elegido = caja.metodoPago === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => caja.setMetodoPago(m)}
                      className={`flex items-center gap-2 rounded-lg border-2 px-2.5 py-2 text-xs font-medium transition-colors ${
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
            </>
          ) : null}

          {caja.aCredito ? (
            <label className="mt-3 block">
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

          {!caja.puedeConfirmar && caja.motivoNoConfirmar && !caja.error ? (
            <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
              {caja.motivoNoConfirmar}
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
  const { clientes, error: errorClientes, mutate } = useClientes();
  const [abierto, setAbierto] = useState(false);
  const [registrando, setRegistrando] = useState(false);
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

      {registrando ? (
        <NuevoClienteRapido
          mostrarTitulo={false}
          onCancelar={() => setRegistrando(false)}
          onCreado={(c) => {
            // Queda elegido para esta venta y además entra en la lista, así el
            // buscador de al lado lo encuentra como a cualquier otro.
            caja.elegirCliente(c);
            void mutate();
            setRegistrando(false);
          }}
        />
      ) : abierto ? (
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
          {errorClientes ? (
            // La lista no se pudo cargar: decirlo, en vez de que parezca vacía.
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2">
              <p className="text-xs font-medium text-rose-700">No se pudo cargar la lista de clientes.</p>
              <p className="mt-0.5 text-[11px] text-rose-600">{errorClientes.message}</p>
              <button
                type="button"
                onClick={() => mutate()}
                className="mt-1.5 rounded-md border border-rose-300 px-2 py-1 text-[11px] font-medium text-rose-700"
              >
                Reintentar
              </button>
            </div>
          ) : filtrados.length === 0 ? (
            <p className="mt-3 text-center text-xs text-slate-400">
              {query ? `Ningún cliente coincide con “${query}”.` : "Todavía no hay clientes cargados."}
            </p>
          ) : null}
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
          <button
            type="button"
            onClick={() => {
              setAbierto(false);
              setRegistrando(true);
            }}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Registrar nuevo cliente
          </button>
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
            onClick={() => setRegistrando(true)}
            aria-label="Registrar nuevo cliente"
            title="Registrar nuevo cliente"
            className="shrink-0 rounded-lg border-2 border-slate-200 p-2 text-slate-600 transition-colors hover:bg-slate-50"
          >
            <UserPlus className="h-4 w-4" />
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
  const { emisor } = useEmisor();
  const [verFactura, setVerFactura] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const { fecha, hora } = fechaHora(venta.fecha);

  // La unidad de cada producto no viaja en la venta, pero sí está en el carrito
  // que la acaba de generar: sin ella, 1,5 KG se lee como 1,5 a secas.
  const unidades = Object.fromEntries(
    caja.carrito.map((i) => [i.producto.id, i.producto.unidad_medida])
  );

  const cobro = caja.aCredito
    ? "A crédito"
    : (METODOS_PAGO.find((m) => m.value === caja.metodoPago)?.label ?? "—");

  const datos: DatosComprobante = {
    venta,
    emisor,
    cliente: caja.nombreCliente,
    formaPago: cobro,
    unidades,
  };

  const legal = esFacturaLegal(emisor);

  if (verFactura) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <FacturaVenta datos={datos} telefonoCliente={caja.cliente?.telefono ?? null} />
        <div className="no-imprimir px-4">
          <button
            type="button"
            onClick={() => setVerFactura(false)}
            className="w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Volver al resumen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-9 w-9 text-emerald-500" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-900">
          {legal ? "¡Factura generada exitosamente!" : "¡Venta registrada!"}
        </h1>

        <dl className="mt-6 space-y-2 text-left">
          <Dato
            label={legal ? "N.° de factura" : "N.° de venta"}
            valor={venta.numero_control}
          />
          <Dato label="Fecha y hora" valor={`${fecha} ${hora}`} />
          <Dato label="Cliente" valor={caja.nombreCliente} />
          <Dato label="Cobro" valor={cobro} />
          <div className="flex items-center justify-between border-t border-slate-100 pt-2">
            <dt className="text-sm font-semibold text-slate-900">Total</dt>
            <dd className="text-2xl font-bold tabular-nums text-slate-900">
              {formatGs(venta.total)}
            </dd>
          </div>
        </dl>

        {aviso ? (
          <p role="status" className="mt-4 rounded-lg bg-slate-100 p-2.5 text-xs text-slate-600">
            {aviso}
          </p>
        ) : null}

        {/* El comprobante no se abre solo: lo que el cajero necesita leer de un
            vistazo es el número y el total. Imprimirlo o mandárselo al cliente
            queda a un clic, dentro de la factura. */}
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => setVerFactura(true)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white"
            style={{ backgroundColor: TEAL }}
          >
            <FileText className="h-4 w-4" />
            Ver factura
          </button>
          <button
            type="button"
            onClick={async () => setAviso(await compartirComprobante(datos))}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-semibold"
            style={{ borderColor: TEAL, color: "#3F8E91" }}
          >
            <Share2 className="h-4 w-4" />
            Compartir
          </button>
        </div>

        <div className="mt-2 flex gap-2">
          <Link
            href="/ventas/arqueo"
            className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Ver arqueo
          </Link>
          <button
            type="button"
            onClick={caja.reiniciar}
            className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
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
