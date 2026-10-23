"use client";

import Link from "next/link";
import SelectorListaPrecio from "@/shared/caja/SelectorListaPrecio";
import { precioSegunLista } from "@/lib/ventas/listas-precio";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Producto } from "@/lib/inventario/types";
import {
  CheckCircle2,
  FileText,
  Receipt,
  ScanBarcode,
  Search,
  Share2,
  Trash2,
} from "lucide-react";
import { useCatalogoVenta } from "@/shared/hooks/useInventario";
import AvisoCatalogoCaja, { textoMotivoSalon } from "@/shared/caja/AvisoCatalogoCaja";
import ModalComprobante from "@/shared/caja/ModalComprobante";
import { coincideBusqueda, leerEtiquetaBalanza, productoPorCodigo, textoSinResultado, useLectorGlobal } from "@/shared/caja/lector-codigo";
import FinalizarVenta from "@/shared/caja/FinalizarVenta";
import { useSoloCaja } from "@/shared/hooks/useSoloCaja";
import TicketVenta from "@/shared/caja/TicketVenta";
import { EstadoFacturaSifen, VisorKude, useEmisionSifen } from "@/shared/caja/FacturaSifen";
import ReciboVenta from "@/shared/caja/ReciboVenta";
import FacturaVenta from "@/shared/caja/FacturaVenta";
import { useEmisor } from "@/shared/hooks/useEmisor";
import { compartirComprobante } from "@/lib/ventas/compartir-comprobante";
import { esFacturaLegal, fechaHora, type DatosComprobante } from "@/lib/ventas/comprobante";
import SelectorCantidad from "@/shared/caja/SelectorCantidad";
import { esPesable, formatCantidad } from "@/lib/inventario/unidades";
import { formatGs, useCajaVenta, type CajaVenta } from "@/shared/caja/useCajaVenta";
import SelectorReparto from "@/shared/caja/SelectorReparto";
import { METODOS_PAGO, type TipoIvaVenta } from "@/lib/ventas/types";

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


/** El buscador de productos: adonde vuelve el cursor después de cada paso. */
function enfocarBuscador() {
  document.getElementById("caja-buscar")?.focus();
}

/** Hace clic en un botón de la caja por su id, si existe y está habilitado. */
function tocar(id: string) {
  const b = document.getElementById(id);
  if (b instanceof HTMLButtonElement && !b.disabled) b.click();
}

export default function CajaDesktop() {
  const caja = useCajaVenta();
  const soloCaja = useSoloCaja();

  // La venta ya está registrada y la caja limpia: el comprobante se abre en
  // una ventana encima, y "Nueva venta" la cierra.
  const listo = caja.paso === "listo" && caja.ventaCreada && caja.comprobante;

  // Imprimir al cobrar: se recuerda en esta computadora.
  const [imprimir, setImprimirEstado] = useState(() => {
    try {
      return localStorage.getItem("caja:imprimir") !== "0";
    } catch {
      return true;
    }
  });
  function setImprimir(v: boolean) {
    setImprimirEstado(v);
    try {
      localStorage.setItem("caja:imprimir", v ? "1" : "0");
    } catch {
      // Sin almacenamiento: vale para esta sesión.
    }
  }

  // Atajos de teclado: la caja se maneja sin soltar el teclado (ni el lector).
  useEffect(() => {
    if (listo) return;
    function onKey(e: KeyboardEvent) {
      if (document.querySelector('[role="dialog"]')) return;
      // Enter suelto (el cursor fuera de todo campo y botón) también finaliza.
      const suelto = e.key === "Enter" && (e.target === document.body || e.target === null);
      const finalizar = e.key === "F9" || (e.key === "Enter" && (e.ctrlKey || e.metaKey)) || suelto;
      if (e.key === "F2") enfocarBuscador();
      else if (finalizar) tocar("caja-cobrar");
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listo]);

  // Cerrado el comprobante (Nueva venta), el cursor vuelve al buscador.
  useEffect(() => {
    if (!listo) enfocarBuscador();
  }, [listo]);

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-4">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Caja</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Cargá los productos y cobrá sin salir de esta pantalla.
          </p>
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <Atajo tecla="F2">buscar</Atajo>
            <Atajo tecla="Enter">agregar · con el buscador vacío, finalizar</Atajo>
            <Atajo tecla="3*">cantidad (3*arroz)</Atajo>
            <Atajo tecla="F9">finalizar</Atajo>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/ventas/arqueo"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Arqueo y movimientos
          </Link>
          {soloCaja ? null : (
            <Link
              href="/ventas"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Ver ventas
            </Link>
          )}
        </div>
      </header>

      {/* Como la caja de un súper: a la izquierda el buscador, la venta en
          forma de ticket y los más vendidos; a la derecha, fijo, el TOTAL
          grande y Finalizar. Todo entra en la pantalla sin scrollear. */}
      <div className="grid grid-cols-[minmax(0,1fr)_290px] items-start gap-4 xl:grid-cols-[minmax(0,1fr)_330px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <Catalogo caja={caja} />
        <PanelCobro caja={caja} imprimir={imprimir} setImprimir={setImprimir} />
      </div>

      {listo ? (
        <ModalComprobante>
          <Comprobante caja={caja} imprimir={imprimir} />
        </ModalComprobante>
      ) : null}
    </div>
  );
}

// ── Columna izquierda: catálogo ──────────────────────────────────────────────

function Catalogo({ caja }: { caja: CajaVenta }) {
  // Si la venta sale de un camión, el catálogo es el stock de ese camión.
  const { productos, origen, isLoading, errorCatalogo } = useCatalogoVenta(caja.repartoId);
  const [query, setQuery] = useState("");

  // Los 9 más vendidos: el servidor devuelve solo los ids (ordenados de más a
  // menos), y acá se cruzan con el catálogo, que ya trae stock y precio. Si no
  // hay historial, queda vacío y se muestran los primeros del catálogo.
  const [idsTop, setIdsTop] = useState<string[]>([]);
  useEffect(() => {
    let cancel = false;
    fetch("/api/productos/mas-vendidos?limit=9", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancel && j?.success && Array.isArray(j.data?.ids)) setIdsTop(j.data.ids as string[]);
      })
      .catch(() => {
        // Sin ranking la caja igual funciona: muestra los primeros del catálogo.
      });
    return () => {
      cancel = true;
    };
  }, []);

  // Sin stock no se ofrece, pero lo que ya está en el carrito se queda: sacarlo
  // de la lista a mitad de la venta haría desaparecer una línea ya cargada.
  const conStock = useMemo(
    () => productos.filter((p) => p.stock_actual > 0 || caja.cantidadDe(p.id) > 0),
    [productos, caja]
  );
  const ocultosSinStock = productos.length - conStock.length;

  // "3*arroz" o "3*" + escaneo: la cantidad va adelante del asterisco.
  const { cantidad: multiplicador, texto } = separarCantidad(query);

  const filtrados = useMemo(() => {
    const q = texto.trim().toLowerCase();
    if (!q) return conStock;
    return conStock.filter((p) => coincideBusqueda(p, q));
  }, [conStock, texto]);

  // Buscador vacío: solo los 9 más vendidos (los del ranking primero, después
  // el resto por nombre para completar los 9). Con búsqueda, se muestran todas
  // las coincidencias, para poder encontrar cualquier producto.
  const sinBusqueda = texto.trim() === "";
  const topNueve = useMemo(() => {
    const rango = new Map(idsTop.map((id, i) => [id, i]));
    return [...conStock]
      .sort((a, b) => {
        const ra = rango.get(a.id) ?? Infinity;
        const rb = rango.get(b.id) ?? Infinity;
        return ra !== rb ? ra - rb : a.nombre.localeCompare(b.nombre);
      })
      .slice(0, 9);
  }, [conStock, idsTop]);

  // El producto marcado con las flechas: Enter agrega ese. Vuelve al primero
  // cada vez que cambia la búsqueda.
  const [resaltado, setResaltado] = useState(0);
  const listaRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    listaRef.current
      ?.querySelector(`[data-indice="${resaltado}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [resaltado]);

  // Lector de código de barras: el código exacto agrega el producto de una.
  // Si es por kilo no se puede agregar solo (falta el peso): queda filtrado.
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  function agregar(p: Producto, cantidad: number | null): void {
    if (p.stock_actual <= 0 && caja.cantidadDe(p.id) <= 0) {
      setAviso({ ok: false, texto: `${p.nombre}: sin stock.` });
      return;
    }
    if (esPesable(p.unidad_medida) && cantidad === null) {
      setQuery(p.sku);
      setAviso({
        ok: true,
        texto: `${p.nombre} se vende por ${p.unidad_medida}: cargá el peso en la tarjeta, o escribí 1,5*${p.sku}.`,
      });
      return;
    }
    const n = cantidad ?? 1;
    const antes = caja.cantidadDe(p.id);
    caja.cambiarCantidad(p, n);
    setQuery("");
    setResaltado(0);
    const topeado = antes + n > p.stock_actual;
    setAviso(
      topeado
        ? { ok: false, texto: `${p.nombre}: solo hay ${formatCantidad(p.stock_actual, p.unidad_medida)} en stock.` }
        : { ok: true, texto: `Agregado: ${n === 1 ? "" : `${formatCantidad(n, p.unidad_medida)} × `}${p.nombre}` }
    );
  }

  function escaneado(codigo: string, cantidad: number | null = null): boolean {
    const p = productoPorCodigo(productos, codigo);
    if (!p) {
      // Etiqueta de la balanza: trae el producto y el peso.
      const etiqueta = leerEtiquetaBalanza(productos, codigo);
      if (etiqueta) {
        agregar(etiqueta.producto, etiqueta.cantidad);
        return true;
      }
      setAviso({ ok: false, texto: `No hay ningún producto con el código ${codigo}.` });
      return false;
    }
    agregar(p, cantidad);
    return true;
  }
  useLectorGlobal(escaneado);

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setQuery("");
      setResaltado(0);
      setAviso(null);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (filtrados.length === 0) return;
      e.preventDefault();
      setResaltado((i) =>
        e.key === "ArrowDown" ? Math.min(i + 1, filtrados.length - 1) : Math.max(i - 1, 0)
      );
      return;
    }
    if (e.key !== "Enter" || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    // Buscador vacío: ya está todo cargado, se pasa a finalizar la venta.
    if (!texto.trim()) {
      if (caja.carrito.length > 0) tocar("caja-cobrar");
      return;
    }
    // Primero el código exacto (lo que manda el lector); si no, el marcado.
    if (productoPorCodigo(productos, texto) || leerEtiquetaBalanza(productos, texto)) {
      escaneado(texto.trim(), multiplicador);
      return;
    }
    const p = filtrados[Math.min(resaltado, filtrados.length - 1)];
    if (p) agregar(p, multiplicador);
  }


  // Buscando: la lista de resultados se despliega debajo del buscador, sobre
  // el ticket, y se cierra al agregar.
  const buscando = !sinBusqueda;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <section className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            id="caja-buscar"
            autoFocus
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setResaltado(0);
              setAviso(null);
            }}
            onKeyDown={alTeclear}
            placeholder="Buscar por nombre o código, o escaneá (F2)…   ·   3*arroz = 3 unidades"
            className="w-full rounded-xl border-2 border-slate-200 bg-white py-3.5 pl-12 pr-12 text-base shadow-sm outline-none focus:border-[#4FAEB2] focus:ring-4 focus:ring-[#4FAEB2]/15"
          />
          <ScanBarcode
            aria-hidden="true"
            className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
          />
        </div>

        {buscando ? (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            {isLoading ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">Cargando productos…</p>
            ) : filtrados.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">{textoSinResultado(productos, texto)}</p>
            ) : (
              <ul ref={listaRef} className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto">
                {filtrados.map((p, i) => {
                  const pesable = esPesable(p.unidad_medida);
                  const cantidad = caja.cantidadDe(p.id);
                  return (
                    <li
                      key={p.id}
                      data-indice={i}
                      onMouseEnter={() => setResaltado(i)}
                      className={`flex items-center gap-3 px-4 py-2 ${i === resaltado ? "bg-[#4FAEB2]/10" : ""}`}
                    >
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => {
                          agregar(p, pesable ? null : multiplicador);
                          enfocarBuscador();
                        }}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span className="w-16 shrink-0 font-mono text-xs text-slate-400">{p.sku}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{p.nombre}</span>
                        <span className="w-24 shrink-0 text-right text-xs text-slate-400">
                          {formatCantidad(p.stock_actual, p.unidad_medida)} {p.unidad_medida}
                        </span>
                        <span className="w-28 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">
                          {formatGs(precioSegunLista(p.precio_venta, caja.lista))}
                        </span>
                      </button>
                      {pesable ? (
                        <div className="shrink-0">
                          <SelectorCantidad
                            producto={p}
                            cantidad={cantidad}
                            cambiarCantidad={caja.cambiarCantidad}
                            fijarCantidad={caja.fijarCantidad}
                            size="sm"
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="border-t border-slate-100 bg-slate-50 px-4 py-1.5 text-[11px] text-slate-400">
              ↑ ↓ para elegir · Enter agrega · Esc cierra
            </p>
          </div>
        ) : null}

        {aviso ? (
          <p
            role="status"
            className={`mt-2 rounded-lg px-3 py-1.5 text-xs font-medium ${
              aviso.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
            }`}
          >
            {aviso.texto}
          </p>
        ) : null}
        {errorCatalogo ? (
          <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
            <p className="text-sm font-semibold text-rose-700">No se pudo cargar la lista de productos.</p>
            <p className="mt-1 text-xs text-rose-600">{errorCatalogo}</p>
            <p className="mt-1 text-xs text-rose-600">Esto no es falta de stock: la consulta falló.</p>
          </div>
        ) : null}
        {isLoading ? null : <AvisoCatalogoCaja origen={origen} ocultos={ocultosSinStock} />}
      </section>

      <TicketActual caja={caja} />

      {/* Más vendidos: un toque y se agrega. */}
      {!isLoading && !errorCatalogo ? (
        topNueve.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
            {caja.repartoId
              ? "El camión está vacío. Se carga con una compra que tenga este camión como destino."
              : "No hay stock disponible para vender en el salón. Cargalo con una compra con destino Salón, o pasá mercadería de un camión al salón desde Camiones."}
            {textoMotivoSalon(origen) ? (
              <span className="mt-2 block text-slate-500">{textoMotivoSalon(origen)}</span>
            ) : null}
          </p>
        ) : (
          <section>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Más vendidos</p>
            {/* Una sola fila: entran los que caben en el ancho (las demás filas
                miden 0), así el ticket nunca queda empujado fuera de la pantalla. */}
            <div
              className="grid gap-2 overflow-hidden"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gridAutoRows: 0, gridTemplateRows: "auto", rowGap: 0 }}
            >
              {topNueve.map((p) => {
                const cantidad = caja.cantidadDe(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    tabIndex={-1}
                    onClick={() => {
                      agregar(p, null);
                      enfocarBuscador();
                    }}
                    className={`relative rounded-xl border bg-white px-3 py-2 text-left transition-colors hover:border-[#4FAEB2] hover:bg-[#4FAEB2]/5 ${
                      cantidad > 0 ? "border-[#4FAEB2]" : "border-slate-200"
                    }`}
                  >
                    <span className="line-clamp-2 pr-5 text-xs font-semibold leading-tight text-slate-800">{p.nombre}</span>
                    <span className="mt-1 block text-xs font-bold tabular-nums text-[#3F8E91]">
                      {formatGs(precioSegunLista(p.precio_venta, caja.lista))}
                    </span>
                    {cantidad > 0 ? (
                      <span className="absolute right-1.5 top-1.5 rounded-full bg-[#4FAEB2] px-1.5 text-[10px] font-bold text-white">
                        {formatCantidad(cantidad, p.unidad_medida)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        )
      ) : null}
    </div>
  );
}

/**
 * La venta en curso como el ticket de un súper: una fila por producto, con
 * código, cantidad editable, precio, IVA y subtotal. El último que se agregó
 * queda marcado y a la vista.
 */
function TicketActual({ caja }: { caja: CajaVenta }) {
  const ultimo = caja.carrito[caja.carrito.length - 1]?.producto.id ?? null;
  const finRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "nearest" });
  }, [caja.carrito.length]);

  return (
    <section className="flex min-h-[260px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="grid grid-cols-[44px_minmax(0,1fr)_108px_80px_52px_92px_24px] 2xl:grid-cols-[64px_minmax(0,1fr)_130px_100px_64px_112px_32px] items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <span>Código</span>
        <span>Producto</span>
        <span className="text-center">Cantidad</span>
        <span className="text-right">Precio</span>
        <span className="text-center">IVA</span>
        <span className="text-right">Subtotal</span>
        <span />
      </div>
      <div className="max-h-[calc(100vh-430px)] min-h-[200px] flex-1 overflow-y-auto">
        {caja.carrito.length === 0 ? (
          <p className="flex h-full min-h-[200px] items-center justify-center px-4 text-center text-sm text-slate-400">
            Escaneá o buscá un producto para empezar la venta.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {caja.carrito.map((item) => {
              const linea = caja.lineas.find((l) => l.producto_id === item.producto.id);
              const esUltimo = item.producto.id === ultimo;
              return (
                <li
                  key={item.producto.id}
                  className={`grid grid-cols-[44px_minmax(0,1fr)_108px_80px_52px_92px_24px] 2xl:grid-cols-[64px_minmax(0,1fr)_130px_100px_64px_112px_32px] items-center gap-2 px-4 py-2 ${
                    esUltimo ? "bg-[#4FAEB2]/10" : ""
                  }`}
                >
                  <span className="truncate font-mono text-xs text-slate-400">{item.producto.sku}</span>
                  <span className="line-clamp-2 text-sm font-medium leading-tight text-slate-900" title={item.producto.nombre}>
                    {item.producto.nombre}
                  </span>
                  <span className="flex justify-center">
                    <SelectorCantidad
                      producto={item.producto}
                      cantidad={item.cantidad}
                      cambiarCantidad={caja.cambiarCantidad}
                      fijarCantidad={caja.fijarCantidad}
                      size="sm"
                    />
                  </span>
                  <span className="text-right text-sm tabular-nums text-slate-600">
                    {formatGs(precioSegunLista(item.producto.precio_venta, caja.lista))}
                  </span>
                  <span className="flex justify-center">
                    <select
                      value={item.tipoIva}
                      onChange={(e) => caja.cambiarIva(item.producto.id, e.target.value as TipoIvaVenta)}
                      aria-label={`IVA de ${item.producto.nombre}`}
                      className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] text-slate-600"
                    >
                      {IVAS.map((iva) => (
                        <option key={iva} value={iva}>
                          {iva === "EXENTA" ? "Ex." : iva}
                        </option>
                      ))}
                    </select>
                  </span>
                  <span className="text-right text-sm font-semibold tabular-nums text-slate-900">
                    {formatGs(linea?.total_linea ?? 0)}
                  </span>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => {
                      caja.quitarItem(item.producto.id);
                      enfocarBuscador();
                    }}
                    aria-label={`Quitar ${item.producto.nombre} de la venta`}
                    className="flex justify-center rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={finRef} />
      </div>
    </section>
  );
}

// ── Columna derecha: cliente, carrito, totales y pago ────────────────────────

function PanelCobro({
  caja,
  imprimir,
  setImprimir,
}: {
  caja: CajaVenta;
  imprimir: boolean;
  setImprimir: (v: boolean) => void;
}) {
  const [cobrando, setCobrando] = useState(false);

  // El cliente y el comprobante se eligen al finalizar. Si todavía no hay
  // cliente arranca como ticket sin nombre, y casi todo el mostrador se cobra
  // en efectivo: viene elegido, y se cambia con una flecha si no.
  function abrirCobro() {
    if (!caja.cliente) {
      caja.elegirSinNombre();
      caja.setDocumento("ticket");
    }
    if (!caja.aCredito && !caja.metodoPago) caja.setMetodoPago("efectivo");
    setCobrando(true);
  }
  return (
    <aside className="sticky top-4">
      <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-slate-900 px-5 py-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Total a cobrar</p>
          <p className="mt-1 break-all text-4xl font-bold leading-none tabular-nums xl:text-[2.6rem] 2xl:text-5xl">
            {formatGs(caja.totales.total)}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {caja.totales.renglones === 0
              ? "Sin productos"
              : `${caja.totales.renglones} ${caja.totales.renglones === 1 ? "producto" : "productos"}${
                  caja.totales.unidades > 0 ? ` · ${formatCantidad(caja.totales.unidades, "u")} u.` : ""
                }`}
          </p>
        </div>

        <div className="space-y-2 px-5 py-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">IVA incluido</span>
            <span className="tabular-nums text-slate-700">{formatGs(caja.totales.montoIva)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="shrink-0 text-slate-500">Precio</span>
            <div className="min-w-0">
              <SelectorListaPrecio caja={caja} />
            </div>
          </div>
        </div>

        <div className="space-y-2 border-t border-slate-100 p-5">
          <button
            id="caja-cobrar"
            type="button"
            onClick={abrirCobro}
            disabled={caja.carrito.length === 0}
            className="w-full rounded-xl py-4 text-lg font-bold text-white shadow-sm transition-opacity disabled:opacity-40"
            style={{ backgroundColor: TEAL }}
          >
            Finalizar venta
            <span className="ml-2 rounded bg-white/20 px-1.5 py-0.5 text-xs font-semibold">F9</span>
          </button>
          <button
            type="button"
            disabled={caja.carrito.length === 0}
            onClick={() => {
              if (!window.confirm("¿Cancelar esta venta? Se sacan todos los productos.")) return;
              for (const i of [...caja.carrito]) caja.quitarItem(i.producto.id);
              enfocarBuscador();
            }}
            className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            Cancelar venta
          </button>
        </div>
      </div>

      {cobrando ? (
        <FinalizarVenta
          caja={caja}
          imprimir={imprimir}
          setImprimir={setImprimir}
          extras={
            <>
              {caja.repartosAbiertos.length > 0 ? (
                <div className="mt-3">
                  <SelectorReparto caja={caja} />
                </div>
              ) : null}
              <OpcionesMoneda caja={caja} />
            </>
          }
          onCerrar={() => {
            setCobrando(false);
            enfocarBuscador();
          }}
          onConfirmada={() => setCobrando(false)}
        />
      ) : null}
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

// ── Comprobante ──────────────────────────────────────────────────────────────

function Comprobante({ caja, imprimir }: { caja: CajaVenta; imprimir: boolean }) {
  const venta = caja.ventaCreada!;
  const { emisor } = useEmisor();
  // `null`: todavía nadie la abrió ni la cerró; con "imprimir al cobrar" se
  // abre sola en cuanto está lista.
  const [verFactura, setVerFactura] = useState<boolean | null>(null);
  const [verRecibo, setVerRecibo] = useState(false);
  const [verKude, setVerKude] = useState<boolean | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const { fecha, hora } = fechaHora(venta.fecha);

  // El cliente, el cobro y las unidades salen de la copia tomada al confirmar:
  // la caja ya quedó limpia para la venta siguiente.
  const comp = caja.comprobante!;

  // Factura: si la empresa factura por SIFEN, se emite la electrónica y lo que
  // se imprime es el KuDE aprobado. Si no, sigue el comprobante de siempre.
  const emision = useEmisionSifen(venta.id, comp.documento === "factura");
  const conSifen = emision.estado !== "inactivo";
  const unidades = comp.unidades;

  const mostrarKude =
    Boolean(emision.facturaId) && (verKude ?? (imprimir && emision.estado === "aprobado"));
  const mostrarFactura =
    verFactura ?? (imprimir && comp.documento === "factura" && emision.estado === "inactivo");
  const objetivo =
    comp.documento === "ticket" ? "ticket" : mostrarKude ? "kude" : mostrarFactura ? "factura" : null;
  useImprimirAlAbrir(imprimir ? objetivo : null);

  const cobro = comp.aCredito
    ? "A crédito"
    : (METODOS_PAGO.find((m) => m.value === comp.metodoPago)?.label ?? "—");

  const datos: DatosComprobante = {
    venta,
    emisor,
    cliente: comp.nombreCliente,
    clienteRuc: comp.rucCliente,
    clienteDireccion: comp.direccionCliente,
    pagaCon: comp.pagaCon,
    formaPago: cobro,
    unidades,
  };

  const legal = esFacturaLegal(emisor);

  // Recibo de dinero: solo al contado, que es cuando entra plata.
  const botonRecibo = comp.aCredito ? null : (
    <button
      type="button"
      onClick={() => setVerRecibo(true)}
      className="flex w-full items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-semibold"
      style={{ borderColor: TEAL, color: "#3F8E91" }}
    >
      <Receipt className="h-4 w-4" />
      Imprimir recibo
    </button>
  );

  if (verRecibo) {
    return (
      <div className="relative w-full max-w-[880px] rounded-2xl bg-[#F8FAFC] pb-4">
        <button
          type="button"
          onClick={() => setVerRecibo(false)}
          className="no-imprimir absolute left-4 top-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          ← Volver
        </button>
        <ReciboVenta datos={datos} />
      </div>
    );
  }

  // Se eligió ticket (lo normal en una venta Sin nombre): sale directo.
  if (comp.documento === "ticket") {
    return (
      <div className="w-full max-w-md rounded-2xl bg-[#F8FAFC] px-4 pb-5 pt-2 shadow-xl">
        <TicketVenta datos={datos} />
        <div className="no-imprimir mb-2">{botonRecibo}</div>
        <div className="no-imprimir flex gap-2">
          <Link
            href="/ventas/arqueo"
            className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-center text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Ver arqueo
          </Link>
          <button
            type="button"
            autoFocus
            onClick={caja.reiniciar}
            className="flex-1 rounded-xl py-3 text-sm font-semibold text-white"
            style={{ backgroundColor: TEAL }}
          >
            Nueva venta <span className="ml-1 text-xs font-medium opacity-80">Enter</span>
          </button>
        </div>
      </div>
    );
  }

  if (mostrarKude && emision.facturaId) {
    return (
      <div className="relative w-full max-w-[900px] rounded-2xl bg-[#F8FAFC] p-4 pt-16">
        <button
          type="button"
          onClick={() => setVerKude(false)}
          className="absolute left-4 top-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          ← Volver al resumen
        </button>
        <BotonNuevaVenta caja={caja} />
        <VisorKude facturaId={emision.facturaId} />
      </div>
    );
  }

  if (mostrarFactura) {
    return (
      <div className="relative w-full max-w-[880px] rounded-2xl bg-[#F8FAFC] pb-4">
        <button
          type="button"
          onClick={() => setVerFactura(false)}
          className="no-imprimir absolute left-4 top-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          ← Volver al resumen
        </button>
        <BotonNuevaVenta caja={caja} />
        <FacturaVenta datos={datos} telefonoCliente={comp.telefonoCliente} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl">
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
          <Dato label="Cliente" valor={comp.nombreCliente} />
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
        {conSifen ? (
          <div className="mt-6">
            <EstadoFacturaSifen emision={emision} onVerKude={() => setVerKude(true)} />
          </div>
        ) : null}

        <div className={`flex gap-2 ${conSifen ? "mt-2" : "mt-6"}`}>
          {/* Con SIFEN la factura es el KuDE de arriba: la hoja interna no se ofrece. */}
          {conSifen ? null : (
            <button
              type="button"
              onClick={() => setVerFactura(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white"
              style={{ backgroundColor: TEAL }}
            >
              <FileText className="h-4 w-4" />
              Ver factura
            </button>
          )}
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

        {botonRecibo ? <div className="mt-2">{botonRecibo}</div> : null}

        <div className="mt-2 flex gap-2">
          <Link
            href="/ventas/arqueo"
            className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Ver arqueo
          </Link>
          <button
            type="button"
            autoFocus
            onClick={caja.reiniciar}
            className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Nueva venta <span className="ml-1 text-xs font-medium opacity-60">Enter</span>
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

/** Etiqueta de un atajo de teclado. */
function Atajo({ tecla, children }: { tecla: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="rounded border border-slate-300 bg-white px-1.5 py-px font-mono text-[10px] font-semibold text-slate-600">
        {tecla}
      </kbd>
      {children}
    </span>
  );
}

/**
 * "3*arroz" → 3 y "arroz"; "1,5*queso" → 1,5 y "queso". Sin asterisco no hay
 * cantidad (se agrega 1) y el texto es la búsqueda entera.
 */
function separarCantidad(q: string): { cantidad: number | null; texto: string } {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*\*\s*(.*)$/.exec(q);
  if (!m) return { cantidad: null, texto: q };
  const n = Number.parseFloat(m[1].replace(",", "."));
  return { cantidad: n > 0 ? n : null, texto: m[2] };
}

/** "Nueva venta" arriba a la derecha de la factura abierta: Enter arranca la siguiente. */
function BotonNuevaVenta({ caja }: { caja: CajaVenta }) {
  return (
    <button
      type="button"
      autoFocus
      onClick={caja.reiniciar}
      className="no-imprimir absolute right-4 top-4 z-10 rounded-lg px-4 py-2 text-sm font-semibold text-white"
      style={{ backgroundColor: TEAL }}
    >
      Nueva venta <span className="ml-1 text-xs font-medium opacity-80">Enter</span>
    </button>
  );
}

/**
 * Imprime una vez el comprobante que se abrió, cuando ya está dibujado (con
 * el logo y el QR cargados). Si no aparece algo imprimible —el KuDE en A4 es
 * un PDF—, no hace nada y queda el botón Imprimir.
 */
function useImprimirAlAbrir(objetivo: string | null) {
  const hecho = useRef(false);
  useEffect(() => {
    if (!objetivo || hecho.current) return;
    let intentos = 0;
    const t = window.setInterval(() => {
      intentos += 1;
      const hoja = document.querySelector(".factura-imprimible");
      const imagenes = hoja ? Array.from(hoja.querySelectorAll("img")) : [];
      if (hoja && imagenes.every((i) => i.complete)) {
        window.clearInterval(t);
        hecho.current = true;
        window.print();
      } else if (intentos > 75) {
        window.clearInterval(t);
      }
    }, 200);
    return () => window.clearInterval(t);
  }, [objetivo]);
}
