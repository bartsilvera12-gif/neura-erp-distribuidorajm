"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import DetalleVenta from "@/shared/ventas/DetalleVenta";
import ModalAnularVenta from "@/shared/ventas/ModalAnularVenta";
import ReimprimirTicket from "@/shared/ventas/ReimprimirTicket";
import ComprobanteVenta from "@/shared/ventas/ComprobanteVenta";
import TarjetaCajaAbierta from "@/shared/caja/TarjetaCajaAbierta";
import { useEffect, useState } from "react";
import { getVentas } from "@/lib/ventas/storage";
import type { Venta, TipoVenta, TipoIvaVenta, MetodoPagoVenta } from "@/lib/ventas/types";
import { METODOS_PAGO } from "@/lib/ventas/types";
import { hoyEnAsuncion } from "@/shared/caja/arqueo-ui";

/** Día (YYYY-MM-DD) en hora de Asunción para una fecha ISO. */
function diaAsuncion(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Asuncion",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

const etiquetaMetodo: Record<MetodoPagoVenta, string> = Object.fromEntries(
  METODOS_PAGO.map((m) => [m.value, m.label])
) as Record<MetodoPagoVenta, string>;

const metodoBadge: Record<MetodoPagoVenta, string> = {
  efectivo: "bg-emerald-50 text-emerald-700",
  transferencia: "bg-sky-50 text-sky-700",
  cheque: "bg-indigo-50 text-indigo-700",
  tarjeta: "bg-fuchsia-50 text-fuchsia-700",
  mixto: "bg-amber-50 text-amber-700",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatGs(valor: number) {
  return `Gs. ${Math.round(valor).toLocaleString("es-PY")}`;
}

function formatFecha(iso: string) {
  try {
    const d    = new Date(iso);
    const dd   = String(d.getDate()).padStart(2, "0");
    const mm   = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh   = String(d.getHours()).padStart(2, "0");
    const min  = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch {
    return iso;
  }
}

// ── Constantes de estilo ───────────────────────────────────────────────────────

const inputFilterClass =
  "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#4FAEB2] focus:outline-none";

const tipoVentaBadge: Record<TipoVenta, string> = {
  CONTADO: "bg-blue-50 text-blue-700",
  CREDITO: "bg-orange-50 text-orange-700",
};

// ── Helpers de fila ───────────────────────────────────────────────────────────

/** Muestra el primer producto de la venta y un badge con el resto. */
function ResumenProductos({ v }: { v: Venta }) {
  const primero = v.items[0];
  if (!primero) {
    return (
      <span className="text-xs text-gray-400">Sin líneas cargadas</span>
    );
  }
  const extra   = v.items.length - 1;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-gray-800 leading-tight">
        {primero.producto_nombre}
      </span>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="font-mono text-xs text-gray-400">{primero.sku}</span>
        {extra > 0 && (
          <span className="bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5 rounded-full font-medium">
            +{extra} más
          </span>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function VentasPage() {
  const hoy = hoyEnAsuncion();
  const [todas,      setTodas]      = useState<Venta[]>([]);
  const [busqueda,   setBusqueda]   = useState("");
  const [filtroTipo, setFiltroTipo] = useState<TipoVenta | "">("");
  const [filtroIva,  setFiltroIva]  = useState<TipoIvaVenta | "">("");
  // Por defecto la clienta quiere ver las ventas del día: desde=hasta=hoy.
  // Con el filtro desde/hasta puede ampliar el rango sin perder el default.
  const [fechaDesde, setFechaDesde] = useState<string>(hoy);
  const [fechaHasta, setFechaHasta] = useState<string>(hoy);
  const [filtroMetodo, setFiltroMetodo] = useState<MetodoPagoVenta | "">("");
  const [viendo,     setViendo]     = useState<Venta | null>(null);
  const [anulando,   setAnulando]   = useState<Venta | null>(null);
  const [ticket,     setTicket]     = useState<Venta | null>(null);
  const [recarga,    setRecarga]    = useState(0);

  useEffect(() => {
    let cancelled = false;
    getVentas().then((data) => {
      if (cancelled) return;
      const ordenadas = [...data].sort((a, b) => {
        const ta = new Date(a.fecha).getTime();
        const tb = new Date(b.fecha).getTime();
        return tb - ta || b.numero_control.localeCompare(a.numero_control);
      });
      setTodas(ordenadas);
    });
    return () => {
      cancelled = true;
    };
  }, [recarga]);

  const filtradas = todas.filter((v) => {
    // Rango de fechas (zona Asunción). Un extremo vacío = sin tope por ese lado.
    if (fechaDesde || fechaHasta) {
      const diaVenta = diaAsuncion(v.fecha);
      if (fechaDesde && diaVenta < fechaDesde) return false;
      if (fechaHasta && diaVenta > fechaHasta) return false;
    }
    // Búsqueda global: número de control, nombre o SKU de cualquier ítem
    if (busqueda.trim() !== "") {
      const t = busqueda.toLowerCase().trim();
      const coincide =
        v.numero_control.toLowerCase().includes(t) ||
        (v.cliente_nombre ?? "").toLowerCase().includes(t) ||
        (v.factura_numero ?? "").toLowerCase().includes(t) ||
        v.items.some(
          (i) =>
            i.producto_nombre.toLowerCase().includes(t) ||
            i.sku.toLowerCase().includes(t)
        );
      if (!coincide) return false;
    }
    // Tipo de venta
    if (filtroTipo !== "" && v.tipo_venta !== filtroTipo) return false;
    // IVA: coincide si al menos un ítem tiene ese tipo
    if (filtroIva !== "" && !v.items.some((i) => i.tipo_iva === filtroIva))
      return false;
    // Método de pago. "mixto" también cubre pagos combinados.
    if (filtroMetodo !== "" && v.metodo_pago !== filtroMetodo) return false;
    return true;
  });

  const filtroFechaCambiado = fechaDesde !== hoy || fechaHasta !== hoy;
  const hayFiltros = busqueda || filtroTipo || filtroIva || filtroMetodo || filtroFechaCambiado;

  return (
    <div className="space-y-6 pb-10">

      {/* Header al estilo del Dashboard */}
      <div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
          />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
            Comercial
          </p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Caja</h1>
        <p className="mt-1 text-sm text-slate-500">Caja de ventas y despacho de productos</p>
      </div>

      {/* ── Estado de la caja ─────────────────────────────────────────────────
          Abrir la caja es lo primero de la mañana y sin eso no se cobra de
          contado, así que va acá arriba y no escondido dentro de una venta.
          Con la caja abierta lo que se muestra es el detalle del cajón: qué
          entró por cada medio, qué salió a mano y cuánto tiene que haber. */}
      <section className="mb-6">
        <TarjetaCajaAbierta />
      </section>

      {/* ── Tabla de ventas ───────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Órdenes de venta
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/camiones"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              Camiones
            </Link>
            <Link
              href="/ventas/arqueo"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              Arqueo de caja
            </Link>
            <Link
              href="/ventas/nueva"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
            >
              + Nueva venta
            </Link>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 mb-5 pb-5 border-b border-gray-100">
          <input
            type="text"
            placeholder="Buscar por número, cliente, factura o producto..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className={`${inputFilterClass} min-w-64`}
          />
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            Desde
            <input
              type="date"
              value={fechaDesde}
              max={fechaHasta || undefined}
              onChange={(e) => setFechaDesde(e.target.value)}
              aria-label="Fecha desde"
              className={inputFilterClass}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            Hasta
            <input
              type="date"
              value={fechaHasta}
              min={fechaDesde || undefined}
              onChange={(e) => setFechaHasta(e.target.value)}
              aria-label="Fecha hasta"
              className={inputFilterClass}
            />
          </label>
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as TipoVenta | "")}
            className={inputFilterClass}
          >
            <option value="">Todos los tipos</option>
            <option value="CONTADO">Contado</option>
            <option value="CREDITO">Crédito</option>
          </select>
          <select
            value={filtroMetodo}
            onChange={(e) => setFiltroMetodo(e.target.value as MetodoPagoVenta | "")}
            aria-label="Filtrar por método de pago"
            className={inputFilterClass}
          >
            <option value="">Todos los medios</option>
            {METODOS_PAGO.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <select
            value={filtroIva}
            onChange={(e) => setFiltroIva(e.target.value as TipoIvaVenta | "")}
            className={inputFilterClass}
          >
            <option value="">Todos los IVA</option>
            <option value="EXENTA">Exenta</option>
            <option value="5%">IVA 5%</option>
            <option value="10%">IVA 10%</option>
          </select>
          {hayFiltros && (
            <button
              onClick={() => {
                setBusqueda("");
                setFiltroTipo("");
                setFiltroIva("");
                setFiltroMetodo("");
                setFechaDesde(hoy);
                setFechaHasta(hoy);
              }}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors px-2"
            >
              Limpiar filtros
            </button>
          )}
          <span className="ml-auto text-sm text-gray-400">
            {filtradas.length} de {todas.length} ventas
          </span>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-sm font-semibold">
                <th className="py-3 pl-3 pr-4 font-medium">Número</th>
                <th className="py-3 pr-4 font-medium">Cliente</th>
                <th className="py-3 pr-4 font-medium">Productos</th>
                <th className="py-3 pr-4 font-medium text-right">Total</th>
                <th className="py-3 pr-4 font-medium">Condición</th>
                <th className="py-3 pr-4 font-medium">Método de pago</th>
                <th className="py-3 pr-4 font-medium">Comprobante</th>
                <th className="py-3 pr-4 font-medium">Fecha</th>
                <th className="py-3 pr-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400">
                    {todas.length === 0
                      ? "No hay ventas registradas"
                      : "Ninguna venta coincide con los filtros"}
                  </td>
                </tr>
              ) : (
                filtradas.map((v) => {
                  const anulada = (v.estado ?? "").toLowerCase() === "anulada";
                  return (
                    <tr
                      key={v.id}
                      onClick={() => setViendo(v)}
                      title="Ver el detalle de la venta"
                      className={`cursor-pointer border-b border-slate-200 last:border-0 hover:bg-slate-50 transition-colors ${
                        anulada ? "opacity-60" : ""
                      }`}
                    >
                      <td className="py-4 pl-3 pr-4 align-middle">
                        <span className="whitespace-nowrap font-mono text-xs text-gray-500">{v.numero_control}</span>
                        {anulada ? (
                          <span className="mt-1 block w-fit rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                            Anulada
                          </span>
                        ) : null}
                      </td>
                      <td className="max-w-[220px] py-4 pr-4 align-middle">
                        <span className="block truncate font-medium text-gray-800">
                          {v.cliente_nombre ?? "Sin nombre"}
                        </span>
                        {v.reparto_etiqueta ? (
                          <span className="block truncate text-xs text-gray-400">{v.reparto_etiqueta}</span>
                        ) : null}
                      </td>
                      <td className="py-4 pr-4 align-middle">
                        <ResumenProductos v={v} />
                      </td>
                      <td className="py-4 pr-4 text-right tabular-nums font-semibold text-gray-800 align-middle">
                        {formatGs(v.total)}
                      </td>
                      <td className="py-4 pr-4 align-middle">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${tipoVentaBadge[v.tipo_venta]}`}>
                          {v.tipo_venta === "CONTADO"
                            ? "Contado"
                            : `Crédito ${v.plazo_dias ?? ""}d`}
                        </span>
                      </td>
                      <td className="py-4 pr-4 align-middle">
                        {v.tipo_venta === "CREDITO" ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : v.metodo_pago === "mixto" && v.pagos_detalle && v.pagos_detalle.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            <span className={`w-fit px-2 py-1 rounded-full text-xs font-semibold ${metodoBadge.mixto}`}>
                              Mixto
                            </span>
                            {v.pagos_detalle.map((p) => (
                              <span key={p.medio} className="text-[11px] text-slate-500 tabular-nums">
                                {etiquetaMetodo[p.medio] ?? p.medio}: {formatGs(p.monto)}
                              </span>
                            ))}
                          </div>
                        ) : v.metodo_pago ? (
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${metodoBadge[v.metodo_pago] ?? "bg-slate-100 text-slate-700"}`}>
                            {etiquetaMetodo[v.metodo_pago] ?? v.metodo_pago}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-4 pr-4 align-middle">
                        <ComprobanteVenta venta={v} />
                      </td>
                      <td className="py-4 pr-4 text-gray-500 text-xs tabular-nums align-middle">
                        {formatFecha(v.fecha)}
                      </td>
                      <td className="py-4 pr-3 align-middle">
                        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setViendo(v)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Ver
                          </button>
                          <button
                            type="button"
                            onClick={() => setTicket(v)}
                            title="Ver y reimprimir el ticket"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            Ticket
                          </button>
                          {anulada ? null : (
                            <button
                              type="button"
                              onClick={() => setAnulando(v)}
                              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                            >
                              Anular
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </section>

      {viendo ? (
        <DetalleVenta
          venta={viendo}
          onCerrar={() => setViendo(null)}
          onAnular={() => { setAnulando(viendo); setViendo(null); }}
        />
      ) : null}
      {ticket ? <ReimprimirTicket venta={ticket} onCerrar={() => setTicket(null)} /> : null}
      {anulando ? (
        <ModalAnularVenta
          venta={anulando}
          onCerrar={() => setAnulando(null)}
          onAnulada={() => { setAnulando(null); setRecarga((n) => n + 1); }}
        />
      ) : null}
    </div>
  );
}
