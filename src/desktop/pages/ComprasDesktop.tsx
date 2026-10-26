"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getCompras,
  getCompraComprobante,
  getCompraDetalle,
  anularCompraApi,
  borrarCompraApi,
  registrarIngresoApi,
  type CompraDetalle,
} from "@/lib/compras/storage";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import NuevaCompraModal from "@/app/compras/NuevaCompraModal";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import type { Compra, TipoPago } from "@/lib/compras/types";

const inputFilterClass =
  "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#4FAEB2]/40 focus:border-[#4FAEB2] focus:outline-none";

function formatGs(valor: number) {
  return `Gs. ${valor.toLocaleString("es-PY")}`;
}

function formatFecha(iso: string) {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch {
    return iso;
  }
}

/** Fecha corta dd/mm/yyyy a partir de un Date. */
function formatFechaCorta(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/**
 * Fecha de vencimiento de la factura: solo tiene sentido a crédito. No se
 * guarda en la base; se calcula con la fecha de compra + los días de plazo.
 */
function fechaVencimiento(c: Compra): string | null {
  if (c.tipo_pago !== "credito" || !c.plazo_dias) return null;
  const d = new Date(c.fecha);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + c.plazo_dias);
  return formatFechaCorta(d);
}

export default function ComprasPage() {
  const [todas, setTodas] = useState<Compra[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipoPago, setFiltroTipoPago] = useState<TipoPago | "">("");
  const [detalle, setDetalle] = useState<Compra | null>(null);
  /** Abrir el detalle directo en «Registrar ingreso» (botón Ingresar de la lista). */
  const [abrirIngreso, setAbrirIngreso] = useState(false);
  const [modalNueva, setModalNueva] = useState(false);
  const [editando, setEditando] = useState<Compra | null>(null);
  const [anulando, setAnulando] = useState<string | null>(null);
  const { isAdmin } = useIsAdmin();

  async function borrar(c: Compra) {
    const ok = window.confirm(
      `¿BORRAR la compra ${c.numero_control} de ${c.proveedor_nombre}?\n\n` +
        (c.estado === "anulada"
          ? "Ya está anulada: se borra del todo y deja de aparecer en la lista."
          : "Se devuelve el stock que entró (del salón o del camión) y la compra deja de existir. No se puede deshacer.")
    );
    if (!ok) return;
    setAnulando(c.id);
    const res = await borrarCompraApi(c.id);
    setAnulando(null);
    if (!res.ok) {
      window.alert(res.error);
      return;
    }
    recargar();
  }

  async function anular(c: Compra) {
    const ok = window.confirm(
      `¿Anular la compra ${c.numero_control} de ${c.proveedor_nombre}?\n\n` +
        "Se devuelve el stock que entró (del salón o del camión) y sale de Cuentas por pagar. No se puede deshacer."
    );
    if (!ok) return;
    setAnulando(c.id);
    const res = await anularCompraApi(c.id);
    setAnulando(null);
    if (!res.ok) {
      window.alert(res.error);
      return;
    }
    recargar();
  }
  /** Null mientras carga; string si el servidor no pudo devolver la lista. */
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  function recargar() {
    setCargando(true);
    getCompras()
      .then(({ compras, error }) => {
        setErrorCarga(error);
        setTodas([...compras].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()));
      })
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    getCompras()
      .then(({ compras, error }) => {
        if (cancel) return;
        setErrorCarga(error);
        setTodas([...compras].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()));
      })
      .finally(() => {
        if (!cancel) setCargando(false);
      });
    return () => { cancel = true; };
  }, []);

  const filtradas = todas.filter((c) => {
    const texto = busqueda.toLowerCase();
    const coincideTexto =
      texto === "" ||
      c.proveedor_nombre.toLowerCase().includes(texto) ||
      c.producto_nombre.toLowerCase().includes(texto) ||
      c.numero_control.toLowerCase().includes(texto);
    const coincideTipoPago = filtroTipoPago === "" || c.tipo_pago === filtroTipoPago;
    return coincideTexto && coincideTipoPago;
  });

  const hayFiltros = busqueda || filtroTipoPago;

  return (
    <div className="space-y-6 pb-10">

      {/* Header tipo Dashboard */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Operaciones · Compras
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Compras</h1>
          <p className="mt-1 text-sm text-slate-500">
            Facturas de compra registradas: directas (aumentan stock) o provenientes de una recepción.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/compras/ordenes"
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-[#3F8E91] hover:bg-[#4FAEB2]/5">
            Órdenes de Compra
          </Link>
          <Link href="/compras/recepciones"
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-[#3F8E91] hover:bg-[#4FAEB2]/5">
            Recepciones
          </Link>
          <ExportExcelButton url="/api/compras/export" />
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Órdenes de compra
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setModalNueva(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
          >
            + Nueva compra
          </button>

          {/* Filtros inline */}
          <input
            type="text"
            placeholder="Buscar por proveedor, producto o N° control..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className={`${inputFilterClass} min-w-[18rem] flex-1`}
          />
          <select
            value={filtroTipoPago}
            onChange={(e) => setFiltroTipoPago(e.target.value as TipoPago | "")}
            className={inputFilterClass}
          >
            <option value="">Todos los pagos</option>
            <option value="contado">Contado</option>
            <option value="credito">Crédito</option>
          </select>
          {hayFiltros && (
            <button
              onClick={() => { setBusqueda(""); setFiltroTipoPago(""); }}
              className="text-[11px] font-semibold text-[#3F8E91] underline-offset-2 hover:underline"
            >
              Limpiar
            </button>
          )}
          <span className="ml-auto text-[11px] text-slate-400">
            {filtradas.length} de {todas.length} compras
          </span>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 text-sm font-semibold">
              <tr>
                <th className="py-3 pr-4 font-medium">Fecha</th>
                <th className="py-3 pr-4 font-medium">N° Factura</th>
                <th className="py-3 pr-4 font-medium">Proveedor</th>
                <th className="py-3 pr-4 font-medium text-right">Total</th>
                <th className="py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400">
                    {cargando
                      ? "Cargando compras…"
                      : errorCarga
                        ? null
                        : todas.length === 0
                          ? "No hay compras registradas"
                          : "Ninguna compra coincide con los filtros"}
                    {!cargando && errorCarga ? (
                      <span className="mx-auto block max-w-xl rounded-lg bg-red-50 p-3 text-left text-sm text-red-700">
                        <span className="block font-semibold">No se pudo cargar la lista de compras.</span>
                        <span className="mt-1 block text-xs">{errorCarga}</span>
                        <span className="mt-1 block text-xs text-red-600">
                          Las compras registradas están guardadas: lo que falló es la consulta que
                          arma esta tabla.
                        </span>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ) : (
                filtradas.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => { setAbrirIngreso(false); setDetalle(c); }}
                    className={`cursor-pointer border-b border-slate-200 last:border-0 hover:bg-slate-50 transition-colors ${
                      c.estado === "anulada" ? "opacity-50" : ""
                    }`}
                  >
                    <td className="py-4 pr-4 text-gray-600 text-xs tabular-nums">
                      {formatFecha(c.fecha)}
                    </td>
                    <td className="py-4 pr-4 font-mono text-xs text-gray-600">
                      {c.numero_comprobante || c.numero_control}
                      {c.pendiente_ingreso && c.estado !== "anulada" ? (
                        <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 font-sans text-[11px] font-semibold text-amber-700">
                          Pendiente de ingresar
                        </span>
                      ) : null}
                    </td>
                    <td className="py-4 pr-4 font-medium text-gray-800">
                      {c.proveedor_nombre}
                    </td>
                    <td className="py-4 pr-4 text-right tabular-nums font-semibold text-gray-800">
                      {formatGs(c.total)}
                    </td>
                    <td className="py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      {c.estado === "anulada" ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-600">Anulada</span>
                          {isAdmin ? (
                            <button type="button" onClick={() => void borrar(c)} disabled={anulando === c.id}
                              className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40">
                              {anulando === c.id ? "…" : "Borrar"}
                            </button>
                          ) : null}
                        </span>
                      ) : (
                        <span className="inline-flex gap-1.5">
                          {c.pendiente_ingreso ? (
                            <button type="button" onClick={() => { setAbrirIngreso(true); setDetalle(c); }}
                              className="rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600">
                              Ingresar
                            </button>
                          ) : null}
                          <button type="button" onClick={() => setEditando(c)}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                            Editar
                          </button>
                          <button type="button" onClick={() => void anular(c)} disabled={anulando === c.id}
                            className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40">
                            {anulando === c.id ? "…" : "Anular"}
                          </button>
                          {isAdmin ? (
                            <button type="button" onClick={() => void borrar(c)} disabled={anulando === c.id}
                              className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40">
                              Borrar
                            </button>
                          ) : null}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      </section>

      {detalle && (
        <CompraDetalleModal compra={detalle} onClose={() => setDetalle(null)} onCambio={recargar} iniciarIngreso={abrirIngreso} />
      )}

      {modalNueva && (
        <NuevaCompraModal
          onClose={() => setModalNueva(false)}
          onSaved={() => { setModalNueva(false); recargar(); }}
        />
      )}

      {editando && (
        <NuevaCompraModal
          editar={editando}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); recargar(); }}
        />
      )}

    </div>
  );
}

function fechaCortaIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

const cant = (n: number) => n.toLocaleString("es-PY", { maximumFractionDigits: 3 });

function CompraDetalleModal({
  compra,
  onClose,
  onCambio,
  iniciarIngreso = false,
}: {
  compra: Compra;
  onClose: () => void;
  onCambio: () => void;
  iniciarIngreso?: boolean;
}) {
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [detalle, setDetalle] = useState<CompraDetalle | null>(null);
  const [cargandoItems, setCargandoItems] = useState(true);
  /** Registrar ingreso: cuánto llega ahora de cada renglón pendiente. */
  const [ingresando, setIngresando] = useState(false);
  const [aIngresar, setAIngresar] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const pendientes = (detalle?.items ?? []).filter((it) => it.cantidad - it.cantidad_ingresada > 1e-9);
  const puedeIngresar = compra.estado !== "anulada" && !!detalle?.admite_ingreso_parcial && pendientes.length > 0;

  // Desde el botón Ingresar de la lista: apenas carga, ya queda para escribir lo que llegó.
  const [ingresoIniciado, setIngresoIniciado] = useState(false);
  if (iniciarIngreso && puedeIngresar && !ingresoIniciado) {
    setIngresoIniciado(true);
    setIngresando(true);
  }

  async function recargarDetalle() {
    const d = await getCompraDetalle(compra.id);
    setDetalle(d);
  }

  async function guardarIngreso() {
    const items = pendientes
      .map((it) => ({ compra_item_id: it.id, cantidad: parseFloat((aIngresar[it.id] ?? "").replace(",", ".")) || 0 }))
      .filter((x) => x.cantidad > 0);
    if (items.length === 0) {
      setAviso({ ok: false, texto: "Poné cuánto llegó de algún producto." });
      return;
    }
    setGuardando(true);
    setAviso(null);
    const r = await registrarIngresoApi(compra.id, items);
    setGuardando(false);
    if (!r.ok) {
      setAviso({ ok: false, texto: r.error });
      return;
    }
    setIngresando(false);
    setAIngresar({});
    setAviso({ ok: true, texto: `Ingreso registrado ${detalle?.destino === "Salón" ? "al salón" : `al ${detalle?.destino.toLowerCase()}`}.` });
    await recargarDetalle();
    onCambio();
  }

  useEffect(() => {
    let cancel = false;
    if (compra.documento_path) {
      setDocLoading(true);
      getCompraComprobante(compra.id)
        .then((d) => { if (!cancel) setDocUrl(d.url); })
        .finally(() => { if (!cancel) setDocLoading(false); });
    }
    getCompraDetalle(compra.id)
      .then((d) => { if (!cancel) setDetalle(d); })
      .finally(() => { if (!cancel) setCargandoItems(false); });
    return () => { cancel = true; };
  }, [compra.id, compra.documento_path]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-900/60 px-0 pt-0 backdrop-blur-sm sm:px-4 sm:pt-20"
      onClick={onClose}
    >
      <div
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-4xl flex-col rounded-none border-0 bg-white shadow-2xl sm:h-auto sm:max-h-[85dvh] sm:rounded-2xl sm:border sm:border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Detalle de compra</h2>
            <p className="font-mono text-xs text-slate-400">{compra.numero_control}</p>
          </div>
          <button onClick={onClose} className="text-xl text-slate-400 hover:text-slate-700">
            ×
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Proveedor</dt>
              <dd className="font-medium text-slate-800">{compra.proveedor_nombre}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Destino</dt>
              <dd className="text-slate-700">{detalle?.destino ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Fecha de compra</dt>
              <dd className="text-slate-700">{formatFecha(compra.fecha)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Vencimiento</dt>
              <dd className="text-slate-700">{fechaCortaIso(detalle?.fecha_vencimiento) ?? fechaVencimiento(compra) ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Camión que la trajo</dt>
              <dd className="text-slate-700">
                {detalle?.camion_transporte ?? (detalle?.destino_camion_id ? detalle.destino.replace(/^Camión /, "") : "—")}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Pago</dt>
              <dd className="text-slate-700">
                {compra.tipo_pago === "credito" ? `Crédito ${compra.plazo_dias ?? ""}${compra.plazo_dias ? " días" : ""}` : "Contado"}
              </dd>
            </div>
            {compra.numero_comprobante ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Comprobante</dt>
                <dd className="text-slate-700">{[compra.tipo_comprobante, compra.numero_comprobante].filter(Boolean).join(" ")}</dd>
              </div>
            ) : null}
          </dl>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Código</th>
                  <th className="px-3 py-2 text-left">Descripción</th>
                  <th className="px-3 py-2 text-right">Comprada</th>
                  <th className="px-3 py-2 text-right">Precio compra</th>
                  <th className="px-3 py-2 text-right">{detalle?.destino === "Salón" ? "Ingresada al salón" : "Ingresada"}</th>
                  <th className="px-3 py-2 text-right">{ingresando ? "Llega ahora" : "Pendiente"}</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cargandoItems ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">Cargando…</td></tr>
                ) : (detalle?.items ?? []).length === 0 ? (
                  <tr>
                    <td className="px-3 py-2 text-slate-400">—</td>
                    <td className="px-3 py-2 text-slate-800">{compra.producto_nombre}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{compra.cantidad}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatGs(compra.costo_unitario)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{compra.cantidad}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">—</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatGs(compra.total)}</td>
                  </tr>
                ) : (
                  detalle!.items.map((it, i) => {
                    const pendiente = it.cantidad - it.cantidad_ingresada;
                    return (
                      <tr key={`${it.id}-${i}`}>
                        <td className="px-3 py-2 tabular-nums text-slate-500">{it.codigo || "—"}</td>
                        <td className="min-w-40 whitespace-normal px-3 py-2 text-slate-800">{it.producto_nombre}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{cant(it.cantidad)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatGs(it.costo_unitario)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{cant(it.cantidad_ingresada)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {ingresando && pendiente > 1e-9 ? (
                            <input
                              inputMode="decimal"
                              value={aIngresar[it.id] ?? ""}
                              onChange={(e) => setAIngresar((p) => ({ ...p, [it.id]: e.target.value }))}
                              placeholder={`máx. ${cant(pendiente)}`}
                              aria-label={`Cuánto llega de ${it.producto_nombre}`}
                              className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
                            />
                          ) : pendiente > 1e-9 ? (
                            <span className="font-semibold text-amber-600">{cant(pendiente)}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatGs(it.total_linea)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200">
                  <td colSpan={6} className="px-3 py-2 text-right font-semibold text-slate-600">Total</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-900">{formatGs(compra.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {aviso ? (
            <p className={`rounded-lg p-2.5 text-xs ${aviso.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {aviso.texto}
            </p>
          ) : null}
          {puedeIngresar && !ingresando ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2.5">
              <p className="text-xs text-amber-800">
                Falta ingresar mercadería de {pendientes.length} {pendientes.length === 1 ? "producto" : "productos"}.
              </p>
              <button
                type="button"
                onClick={() => { setIngresando(true); setAviso(null); }}
                className="rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3F8E91]"
              >
                Registrar ingreso
              </button>
            </div>
          ) : null}
          {ingresando ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAIngresar(Object.fromEntries(pendientes.map((it) => [it.id, String(it.cantidad - it.cantidad_ingresada)])))}
                className="mr-auto text-xs font-semibold text-[#3F8E91] hover:underline"
              >
                Llegó todo lo pendiente
              </button>
              <button type="button" onClick={() => { setIngresando(false); setAIngresar({}); }}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
                Cancelar
              </button>
              <button type="button" onClick={guardarIngreso} disabled={guardando}
                className="rounded-lg bg-[#4FAEB2] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-40">
                {guardando ? "Guardando…" : "Guardar ingreso"}
              </button>
            </div>
          ) : null}

          {compra.documento_path && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Comprobante adjunto</p>
              {docLoading ? (
                <span className="text-sm text-slate-400">Cargando…</span>
              ) : docUrl ? (
                <a href={docUrl} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-semibold text-[#3F8E91] hover:underline">📄 Ver / descargar la factura</a>
              ) : (
                <span className="text-sm text-slate-400">No se pudo abrir el archivo.</span>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t p-5">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
