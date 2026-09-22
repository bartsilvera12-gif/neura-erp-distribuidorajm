"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { enRangoCalendario, rangoDesdeHastaInputs, toCalendarDateStr } from "@/lib/fechas/calendario";
import { getFacturas } from "@/lib/gestion-clientes/storage";
import { getClientes } from "@/lib/clientes/storage";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { RegistrarPagoModal } from "@/components/pagos/RegistrarPagoModal";
import type { Cliente } from "@/lib/clientes/types";
import type { Factura } from "@/lib/gestion-clientes/types";
import { nombreClienteDisplay } from "@/lib/clientes/display-name";
import { TZ_PY } from "@/lib/format/hora-py";
import { useUsuarioActual } from "@/shared/hooks/useUsuarioActual";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";

// ── Estilos base ──────────────────────────────────────────────────────────────

const INPUT_CLS =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";
const LABEL_CLS = "block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-1.5";

// ── Iconos ────────────────────────────────────────────────────────────────────

type IconProps = { className?: string };

const IconWallet = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z" />
    <path d="M16 14h.01" />
    <path d="M20 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2" />
  </svg>
);

const IconClock = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const IconCheckCircle = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const IconCash = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const IconReceipt = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M4 2v20l2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2V2l-2 2-2-2-2 2-2-2-2 2-2-2-2 2-2-2z" />
    <line x1="8" y1="9" x2="16" y2="9" />
    <line x1="8" y1="13" x2="14" y2="13" />
  </svg>
);

const IconInbox = ({ className = "h-6 w-6" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);

type TabPagos = "pendientes" | "cobrados";

function formatFecha(str: string) {
  if (!str) return "—";
  const [y, m, d] = str.split("-");
  return `${d}/${m}/${y}`;
}

/** Fecha + hora del registro del pago (created_at ISO) en hora de Paraguay: "dd/mm/aaaa HH:MM". */
function formatFechaHora(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ_PY,
  });
}

interface PagoCobrado {
  id: string;
  factura_numero: string;
  cliente_id?: string | null;
  cliente_nombre: string;
  cliente_tipo_nombre: string;
  cliente_tipo_slug: string | null;
  servicio_tipo_slug: string | null;
  servicio_tipo_nombre: string;
  monto: number;
  fecha_pago: string;
  metodo_pago: string;
  usuario_email: string;
  usuario_nombre: string;
  referencia?: string;
  /** Timestamp de registro del pago (created_at ISO), para mostrar fecha y hora. */
  fecha_registro?: string;
}

export default function PagosPage() {
  const [tab, setTab] = useState<TabPagos>("pendientes");
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cobrados, setCobrados] = useState<PagoCobrado[]>([]);
  const [cargandoCobrados, setCargandoCobrados] = useState(false);
  const [modalPago, setModalPago] = useState(false);
  // Anulación administrativa: solo admin, y el servidor igual revalida.
  const { usuario } = useUsuarioActual();
  const puedeAnular = esRolAdminEmpresaOGlobal(usuario?.rol ?? null) || usuario?.rol === "super_admin";
  const [porAnular, setPorAnular] = useState<Factura | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<Factura | null>(null);
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");
  const [filtroNombre, setFiltroNombre] = useState("");

  const rangoFechas = useMemo(
    () => rangoDesdeHastaInputs(filtroDesde, filtroHasta),
    [filtroDesde, filtroHasta]
  );

  const fechaEnRangoCalendario = useCallback(
    (fechaRaw: string): boolean => {
      if (!rangoFechas) return true;
      const cal = toCalendarDateStr(fechaRaw);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cal)) return false;
      return enRangoCalendario(cal, rangoFechas.desde, rangoFechas.hasta);
    },
    [rangoFechas]
  );

  useEffect(() => {
    getFacturas().then(setFacturas);
    getClientes().then(setClientes);
  }, []);


  async function fetchCobrados() {
    setCargandoCobrados(true);
    try {
      const res = await fetchWithSupabaseSession("/api/pagos");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setCobrados(
          json.data.map((p: Record<string, unknown>) => ({
            id: p.id as string,
            factura_numero: (p.factura_numero as string) ?? "—",
            cliente_id: (p.cliente_id as string) ?? null,
            cliente_nombre: (p.cliente_nombre as string) ?? "—",
            cliente_tipo_nombre: String(p.cliente_tipo_nombre ?? "—").trim() || "—",
            cliente_tipo_slug:
              p.cliente_tipo_slug === null || p.cliente_tipo_slug === undefined
                ? null
                : String(p.cliente_tipo_slug).trim() || null,
            servicio_tipo_slug:
              p.servicio_tipo_slug === null || p.servicio_tipo_slug === undefined
                ? null
                : String(p.servicio_tipo_slug).trim() || null,
            servicio_tipo_nombre: String(p.servicio_tipo_nombre ?? "").trim() || "Sin clasificar",
            monto: Number(p.monto) || 0,
            fecha_pago: toCalendarDateStr((p.fecha_pago as string) ?? "") || String(p.fecha_pago ?? "").slice(0, 10),
            metodo_pago: (p.metodo_pago as string) ?? "efectivo",
            usuario_email: (p.usuario_email as string) ?? "—",
            usuario_nombre: (p.usuario_nombre as string) ?? (p.usuario_email as string) ?? "—",
            referencia: (p.referencia as string) || undefined,
            fecha_registro: (p.created_at as string) || undefined,
          }))
        );
      } else {
        setCobrados([]);
      }
    } catch {
      setCobrados([]);
    } finally {
      setCargandoCobrados(false);
    }
  }

  useEffect(() => {
    if (tab === "cobrados") fetchCobrados();
  }, [tab]);

  const pendientesBase = useMemo(
    () =>
      facturas.filter((f) => {
        if (f.saldo <= 0 || f.estado === "Anulado" || f.estado === "Corregida NC") return false;
        const cli = clientes.find((c) => c.id === f.cliente_id);
        if (cli?.estado === "inactivo") return false;
        return true;
      }),
    [facturas, clientes]
  );

  // Pendientes filtra SOLO por fecha_vencimiento: el rango "hasta 30/06"
  // debe excluir facturas con vencimiento en julio, aunque su emisión sea de junio.
  const pendientesPorFecha = useMemo(() => {
    if (!rangoFechas) return pendientesBase;
    return pendientesBase.filter((f) => fechaEnRangoCalendario(f.fecha_vencimiento));
  }, [pendientesBase, rangoFechas, fechaEnRangoCalendario]);

  const pendientesVista = useMemo(() => {
    const cmp = (a: Factura, b: Factura) => {
      const av = (a.fecha_vencimiento ?? "").localeCompare(b.fecha_vencimiento ?? "");
      if (av !== 0) return av;
      const ae = (a.fecha ?? "").localeCompare(b.fecha ?? "");
      if (ae !== 0) return ae;
      return (a.numero_factura ?? "").localeCompare(b.numero_factura ?? "");
    };
    const nombreDe = (f: Factura) => {
      const c = clientes.find((x) => String(x.id) === String(f.cliente_id));
      return nombreClienteDisplay(c, "").toLowerCase();
    };
    const q = filtroNombre.trim().toLowerCase();
    const porNombre = (f: Factura) => q === "" || nombreDe(f).includes(q);

    return pendientesPorFecha.filter(porNombre).sort(cmp);
  }, [pendientesPorFecha, filtroNombre, clientes]);

  const cobradosPorFecha = useMemo(() => {
    if (!rangoFechas) return cobrados;
    return cobrados.filter((p) => fechaEnRangoCalendario(p.fecha_pago));
  }, [cobrados, rangoFechas, fechaEnRangoCalendario]);

  const cobradosVista = useMemo(() => {
    const q = filtroNombre.trim().toLowerCase();
    const porNombre = (p: PagoCobrado) =>
      q === "" || (p.cliente_nombre ?? "").toLowerCase().includes(q);
    return cobradosPorFecha.filter(porNombre);
  }, [cobradosPorFecha, filtroNombre]);

  const totalesPendientesVista = useMemo(
    () =>
      pendientesVista.reduce(
        (acc, f) => ({
          monto: acc.monto + (Number.isFinite(f.monto) ? f.monto : 0),
          saldo: acc.saldo + (Number.isFinite(f.saldo) ? f.saldo : 0),
        }),
        { monto: 0, saldo: 0 }
      ),
    [pendientesVista]
  );

  const totalCobradoVista = useMemo(
    () => cobradosVista.reduce((acc, p) => acc + (Number.isFinite(p.monto) ? p.monto : 0), 0),
    [cobradosVista]
  );

  const clienteMapNombre = useMemo(
    () => Object.fromEntries(clientes.map((c) => [c.id, nombreClienteDisplay(c, "—")])),
    [clientes]
  );
  /** Mapa clienteId → vendedor asignado (nombre del usuario resuelto, o el texto libre). */
  const vendedorPorCliente = useMemo(
    () =>
      Object.fromEntries(
        clientes.map((c) => [
          c.id,
          (c.vendedor_usuario_nombre ?? "").trim() || (c.vendedor_asignado ?? "").trim() || "—",
        ])
      ) as Record<string, string>,
    [clientes]
  );
  const METODO_LABELS: Record<string, string> = {
    efectivo: "Efectivo",
    transferencia: "Transferencia",
    cheque: "Cheque",
    tarjeta: "Tarjeta",
    otro: "Otro",
  };

  const hasFilters = Boolean(filtroDesde || filtroHasta || filtroNombre.trim());

  function limpiarFiltros() {
    setFiltroDesde("");
    setFiltroHasta("");
    setFiltroNombre("");
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-6">
      {/* Header: título a la izquierda, tabs Pendientes/Cobrados a la derecha (ahorra espacio) */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Cobranzas
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Pagos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Registrar pagos de facturas pendientes de cobro
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1 rounded-2xl border border-[#4FAEB2]/45 bg-white p-1.5 shadow-sm">
          <TabButton
            active={tab === "pendientes"}
            onClick={() => setTab("pendientes")}
            icon={<IconClock />}
            label="Pendientes"
            count={pendientesVista.length}
          />
          <TabButton
            active={tab === "cobrados"}
            onClick={() => setTab("cobrados")}
            icon={<IconCheckCircle />}
            label="Cobrados"
            count={cobrados.length > 0 ? cobradosVista.length : null}
          />
        </div>
      </div>

      {/* KPIs strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          icon={<IconReceipt />}
          label="Facturas con saldo"
          value={String(pendientesVista.length)}
          sub={
            hasFilters
              ? `de ${pendientesBase.length} en total`
              : pendientesBase.length === pendientesVista.length
                ? "vista actual"
                : `de ${pendientesBase.length} en total`
          }
          accent="neutral"
        />
        <KpiCard
          icon={<IconClock />}
          label="Saldo pendiente"
          value={`Gs. ${totalesPendientesVista.saldo.toLocaleString("es-PY")}`}
          sub={`Total: Gs. ${totalesPendientesVista.monto.toLocaleString("es-PY")}`}
          accent="warning"
        />
        <KpiCard
          icon={<IconCheckCircle />}
          label="Cobrado (filtros)"
          value={`Gs. ${totalCobradoVista.toLocaleString("es-PY")}`}
          sub={`${cobradosVista.length} pago${cobradosVista.length === 1 ? "" : "s"}`}
          accent="featured"
        />
      </div>

      {/* Filtros (compacto: sin encabezado ni descripción para ganar espacio) */}
      <div className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <label className={LABEL_CLS}>Buscar por nombre de cliente</label>
            <input
              type="search"
              value={filtroNombre}
              onChange={(e) => setFiltroNombre(e.target.value)}
              placeholder="Nombre del cliente…"
              className={INPUT_CLS}
            />
          </div>
          <div className="min-w-[10rem]">
            <label className={LABEL_CLS}>
              Desde {tab === "pendientes" ? "(vencimiento)" : "(fecha de pago)"}
            </label>
            <input
              type="date"
              value={filtroDesde}
              onChange={(e) => setFiltroDesde(e.target.value)}
              className={INPUT_CLS}
            />
          </div>
          <div className="min-w-[10rem]">
            <label className={LABEL_CLS}>
              Hasta {tab === "pendientes" ? "(vencimiento)" : "(fecha de pago)"}
            </label>
            <input
              type="date"
              value={filtroHasta}
              onChange={(e) => setFiltroHasta(e.target.value)}
              className={INPUT_CLS}
            />
          </div>
          {hasFilters ? (
            <button
              type="button"
              onClick={limpiarFiltros}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91]"
            >
              Limpiar filtros
            </button>
          ) : null}
        </div>
      </div>

      {/* Tab content: Pendientes */}
      {tab === "pendientes" && (
        <div className="overflow-hidden rounded-2xl border border-[#4FAEB2]/45 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
              <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]" />
                Facturas pendientes de cobro
              </h2>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#4FAEB2]/30 bg-[#4FAEB2]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#3F8E91]">
              {rangoFechas
                ? `${pendientesVista.length} según filtros · ${pendientesBase.length} en total`
                : `${pendientesVista.length} facturas con saldo`}
            </span>
          </div>

          {pendientesBase.length === 0 ? (
            <EmptyState
              title="No hay facturas pendientes de cobro"
              cta={
                <Link
                  href="/clientes"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
                >
                  Ir a Clientes →
                </Link>
              }
            />
          ) : rangoFechas && pendientesPorFecha.length === 0 ? (
            <EmptyState
              title="Ninguna factura con vencimiento en el rango"
              cta={
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="text-xs font-semibold text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
                >
                  Limpiar filtros
                </button>
              }
            />
          ) : pendientesVista.length === 0 ? (
            <EmptyState
              title="Ninguna factura con el tipo de cliente seleccionado"
              cta={
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="text-xs font-semibold text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
                >
                  Ver todos los tipos
                </button>
              }
            />
          ) : (
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full min-w-[960px] table-auto border-separate border-spacing-0 text-sm">
                <thead className="bg-slate-50/80">
                  <tr>
                    {["Número", "Cliente", "Tipo de cliente", "Vendedor", "Fecha", "Vencimiento", "Total", "Saldo", "Estado", "Acción"].map(
                      (h) => {
                        // Padding reducido entre "Estado" y "Acción" (alineado con las celdas).
                        // Antes Estado y Acción iban pegadas (pr-1 / pl-1) y el
                        // botón parecía caer bajo Estado, dejando Acción vacía.
                        const pad = "px-3 first:pl-5 last:pr-5 sm:px-4";
                        return (
                          <th
                            key={h}
                            className={`py-3 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 ${pad}`}
                          >
                            {h}
                          </th>
                        );
                      },
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendientesVista.map((f) => (
                    <tr key={f.id} className="transition-colors hover:bg-[#4FAEB2]/5">
                      <td className="whitespace-nowrap px-3 py-3 first:pl-5 sm:px-4">
                        <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                          {f.numero_factura}
                        </span>
                      </td>
                      <td className="min-w-[12rem] px-3 py-3 sm:px-4 lg:min-w-[16rem]">
                        <Link
                          href={`/clientes/${f.cliente_id}`}
                          className="block min-w-0 break-words text-sm font-medium text-[#3F8E91] hover:underline"
                          title={String(
                            clienteMapNombre[String(f.cliente_id)] ??
                              `Cliente #${String(f.cliente_id).slice(0, 8)}`,
                          )}
                        >
                          {clienteMapNombre[String(f.cliente_id)] ??
                            `Cliente #${String(f.cliente_id).slice(0, 8)}`}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-600 sm:px-4">
                        <span className="inline-block max-w-[12rem] truncate">
                          {vendedorPorCliente[String(f.cliente_id)] ?? "—"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-600 sm:px-4">
                        {formatFecha(f.fecha)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-600 sm:px-4">
                        {formatFecha(f.fecha_vencimiento)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm font-semibold tabular-nums text-slate-900 sm:px-4">
                        Gs. {f.monto.toLocaleString("es-PY")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm font-semibold tabular-nums text-amber-600 sm:px-4">
                        Gs. {f.saldo.toLocaleString("es-PY")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 sm:px-4">
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-amber-500" />
                          {f.estado}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 last:pr-5 sm:px-4">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setFacturaSeleccionada(f);
                              setModalPago(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#4FAEB2] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
                          >
                            <IconCash className="h-3.5 w-3.5" />
                            Cobrar
                          </button>
                          <Link
                            href={`/facturas/${f.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
                            title="Ver la factura"
                          >
                            Ver
                          </Link>
                          {puedeAnular ? (
                            <button
                              type="button"
                              onClick={() => {
                                setPorAnular(f);
                                setMotivoAnulacion("");
                                setErrorAnular(null);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-600 transition-colors hover:bg-rose-100"
                              title="Anular la factura (no la borra)"
                            >
                              Anular
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-100 bg-slate-50/80" role="status">
                    <td colSpan={5} className="px-3 py-4 first:pl-5 sm:px-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-700">
                        {rangoFechas ? "Suma en el rango de fechas" : "Suma de la vista"}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {pendientesVista.length} registro{pendientesVista.length === 1 ? "" : "s"} · recalcula
                        al cambiar fecha, tipo o tabla
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 sm:px-4">
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                        Total
                      </span>
                      <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">
                        Gs. {totalesPendientesVista.monto.toLocaleString("es-PY")}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 sm:px-4">
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-600">
                        Saldo
                      </span>
                      <p className="mt-0.5 text-sm font-bold tabular-nums text-amber-600">
                        Gs. {totalesPendientesVista.saldo.toLocaleString("es-PY")}
                      </p>
                    </td>
                    <td colSpan={2} className="px-3 py-4 last:pr-5 sm:px-4" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab content: Cobrados */}
      {tab === "cobrados" && (
        <div className="overflow-hidden rounded-2xl border border-[#4FAEB2]/45 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div>
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
                <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]" />
                  Pagos registrados
                </h2>
              </div>
              <p className="mt-1 pl-3 text-[11px] text-slate-500">
                Mismo criterio que &ldquo;Cobrado del período&rdquo; en el dashboard financiero.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#4FAEB2]/30 bg-[#4FAEB2]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#3F8E91]">
              {cobrados.length > 0
                ? `${cobradosVista.length} según filtros · ${cobrados.length} en total`
                : "0 pagos"}
            </span>
          </div>

          {cargandoCobrados ? (
            <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
              Cargando pagos…
            </div>
          ) : cobrados.length === 0 ? (
            <EmptyState
              title="No hay pagos registrados"
              subtitle="Los pagos aparecerán aquí cuando los registres."
            />
          ) : rangoFechas && cobradosPorFecha.length === 0 ? (
            <EmptyState
              title="Ningún pago en el rango de fechas seleccionado"
              cta={
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="text-xs font-semibold text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
                >
                  Limpiar filtros
                </button>
              }
            />
          ) : cobradosVista.length === 0 ? (
            <EmptyState
              title="Ningún pago con el tipo de cliente seleccionado"
              cta={
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="text-xs font-semibold text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
                >
                  Ver todos los tipos
                </button>
              }
            />
          ) : (
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full min-w-[1040px] table-auto border-separate border-spacing-0 text-sm">
                <thead className="bg-slate-50/80">
                  <tr>
                    {["Factura", "Cliente", "Vendedor", "Monto pagado", "Fecha", "Método", "Usuario", "Fecha y hora"].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 first:pl-5 last:pr-5 sm:px-4"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cobradosVista.map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-[#4FAEB2]/5">
                      <td className="whitespace-nowrap px-3 py-3 first:pl-5 sm:px-4">
                        <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                          {p.factura_numero}
                        </span>
                      </td>
                      <td className="min-w-[12rem] px-3 py-3 sm:px-4 lg:min-w-[16rem]">
                        <span
                          className="block min-w-0 break-words text-sm font-medium text-slate-900"
                          title={p.cliente_nombre}
                        >
                          {p.cliente_nombre}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-600 sm:px-4">
                        <span
                          className="inline-block max-w-[18rem] truncate 2xl:max-w-none"
                          title={p.servicio_tipo_nombre}
                        >
                          {p.servicio_tipo_nombre}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-600 sm:px-4">
                        <span className="inline-block max-w-[12rem] truncate">
                          {p.cliente_id ? vendedorPorCliente[String(p.cliente_id)] ?? "—" : "—"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm font-semibold tabular-nums text-[#3F8E91] sm:px-4">
                        Gs. {p.monto.toLocaleString("es-PY")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-600 sm:px-4">
                        {formatFecha(p.fecha_pago)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 sm:px-4">
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                          <IconWallet className="h-3 w-3 text-slate-400" />
                          {METODO_LABELS[p.metodo_pago] ?? p.metodo_pago}
                        </span>
                      </td>
                      <td
                        className="px-3 py-3 text-sm text-slate-600 sm:px-4 [overflow-wrap:anywhere] break-words"
                        title={p.usuario_email}
                      >
                        {p.usuario_nombre}
                      </td>
                      <td className="min-w-[6rem] px-3 py-3 text-sm text-slate-500 last:pr-5 sm:px-4 [overflow-wrap:anywhere] break-words">
                        {formatFechaHora(p.fecha_registro)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={8} className="p-0">
                      <div
                        className="flex w-full min-w-0 flex-col items-stretch gap-2 border-t-2 border-slate-100 bg-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                        role="status"
                      >
                        <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-700 sm:max-w-[40%]">
                          {rangoFechas ? "Total cobrado en el rango" : "Total cobrado en esta vista"}
                        </p>
                        <p
                          className="min-w-0 flex-1 whitespace-nowrap text-center text-base font-bold tabular-nums text-[#3F8E91] sm:text-lg"
                          style={{ lineHeight: 1.2 }}
                        >
                          {`Gs. ${totalCobradoVista.toLocaleString("es-PY")}`}
                        </p>
                        <p className="shrink-0 text-left text-[10px] text-slate-500 sm:max-w-[32%] sm:text-right">
                          {cobradosVista.length} registro{cobradosVista.length === 1 ? "" : "s"} ·
                          recalcula al cambiar el filtro
                        </p>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      <RegistrarPagoModal
        open={modalPago && !!facturaSeleccionada}
        factura={
          facturaSeleccionada
            ? {
                id: facturaSeleccionada.id,
                numero_factura: facturaSeleccionada.numero_factura,
                saldo: facturaSeleccionada.saldo,
                moneda: facturaSeleccionada.moneda,
                cliente_id: facturaSeleccionada.cliente_id ?? "",
              }
            : null
        }
        onClose={() => {
          setModalPago(false);
          setFacturaSeleccionada(null);
        }}
        onExito={async () => {
          getFacturas().then(setFacturas);
          if (tab === "cobrados") fetchCobrados();
        }}
      />

      {porAnular ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-slate-800">
              Anular la factura {porAnular.numero_factura}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              La factura <strong>no se borra</strong>: queda registrada con estado «Anulado» y saldo cero, con
              constancia de quién la anuló y por qué. Es lo que corresponde a un documento fiscal.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              No se puede anular si ya tiene pagos imputados o si su documento electrónico fue aprobado por la
              SET: en esos casos va reversión del pago o nota de crédito.
            </p>

            <label className="mt-4 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Motivo (queda asentado)
            </label>
            <textarea
              value={motivoAnulacion}
              onChange={(e) => setMotivoAnulacion(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Ej: cargada dos veces por error"
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
            />
            <p className="mt-1 text-[11px] text-slate-400">Mínimo 5 caracteres.</p>

            {errorAnular ? (
              <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {errorAnular}
              </p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPorAnular(null)}
                disabled={anulando}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={anulando || motivoAnulacion.trim().length < 5}
                onClick={async () => {
                  setAnulando(true);
                  setErrorAnular(null);
                  try {
                    const r = await fetchWithSupabaseSession(`/api/facturas/${porAnular.id}/anular`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ motivo: motivoAnulacion.trim() }),
                    });
                    const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string };
                    if (!r.ok || !j?.success) {
                      // El servidor explica por qué no se puede (pagos, SET, NC).
                      setErrorAnular(j?.error ?? `Error ${r.status}`);
                      return;
                    }
                    setPorAnular(null);
                    getFacturas().then(setFacturas);
                    if (tab === "cobrados") fetchCobrados();
                  } catch (e) {
                    setErrorAnular(e instanceof Error ? e.message : "Error de red.");
                  } finally {
                    setAnulando(false);
                  }
                }}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
              >
                {anulando ? "Anulando…" : "Anular factura"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Sub-componentes locales ───────────────────────────────────────────────────

function KpiCard({
  icon,
  label,
  value,
  sub,
  accent = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: "neutral" | "featured" | "warning";
}) {
  const chipCls =
    accent === "featured"
      ? "border-[#4FAEB2]/30 bg-[#4FAEB2]/12 text-[#4FAEB2]"
      : accent === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-600"
        : "border-slate-200 bg-slate-50 text-slate-500";

  const cardCls =
    accent === "featured"
      ? "relative overflow-hidden rounded-xl border border-[#4FAEB2]/55 bg-gradient-to-br from-white via-white to-[#4FAEB2]/8 px-3.5 py-3 shadow-[0_4px_18px_rgba(79,174,178,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(79,174,178,0.14)]"
      : "relative overflow-hidden rounded-xl border border-[#4FAEB2]/45 bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md";

  return (
    <div className={cardCls}>
      {accent === "featured" ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-[#4FAEB2] via-[#4FAEB2]/70 to-[#4FAEB2]/30"
        />
      ) : null}
      <div className="flex items-start gap-2.5">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${chipCls}`}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {label}
          </p>
          <p
            className={`mt-0.5 truncate text-lg font-semibold tabular-nums leading-tight tracking-tight ${
              accent === "featured" ? "text-[#3F8E91]" : accent === "warning" ? "text-amber-600" : "text-slate-900"
            }`}
          >
            {value}
          </p>
          {sub ? <p className="mt-0.5 truncate text-[10px] text-slate-500">{sub}</p> : null}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
        active
          ? "bg-[#4FAEB2] text-white shadow-md shadow-[#4FAEB2]/30"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      }`}
    >
      <span className={active ? "text-white" : "text-slate-400"}>{icon}</span>
      {label}
      {typeof count === "number" ? (
        <span
          className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function EmptyState({
  title,
  subtitle,
  cta,
}: {
  title: string;
  subtitle?: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#4FAEB2]/25 bg-[#4FAEB2]/8 text-[#4FAEB2]">
        <IconInbox />
      </span>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
      {cta ? <div className="mt-1">{cta}</div> : null}
    </div>
  );
}
