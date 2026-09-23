"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { FacturaElectronicaPanel } from "@/components/sifen/FacturaElectronicaPanel";
import { AnularFacturaButton } from "@/components/facturas/AnularFacturaButton";
import type { FacturaElectronicaDTO, SifenCancelacionPreviewDTO } from "@/lib/sifen/types";

type FacturaApiRow = {
  id: string;
  numero_factura: string;
  fecha: string;
  fecha_vencimiento: string;
  monto: number;
  saldo: number;
  estado: string;
  tipo: string;
  moneda: string;
  cliente_id: string;
  cliente_display?: string;
};

type SifenResumen = {
  sifen_config_exists: boolean;
  sifen_config_activa: boolean;
  sifen_ambiente: string | null;
  sifen_plazo_cancelacion_horas: number;
  factura_electronica: FacturaElectronicaDTO | null;
  cancelacion: SifenCancelacionPreviewDTO | null;
};

function formatFecha(str: string) {
  if (!str) return "—";
  const [y, m, d] = str.split("-");
  return `${d}/${m}/${y}`;
}

function FacturaDetalleInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string | undefined;

  const [factura, setFactura] = useState<FacturaApiRow | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [resumen, setResumen] = useState<SifenResumen | null>(null);
  const [loadingF, setLoadingF] = useState(true);
  const [loadingS, setLoadingS] = useState(true);

  const onResumenLoaded = useCallback((r: SifenResumen) => {
    setResumen(r);
  }, []);

  const reloadFacturaComercial = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetchWithSupabaseSession(`/api/facturas/${id}`);
      const j = (await res.json()) as { success?: boolean; data?: FacturaApiRow; error?: string };
      if (res.ok && j.success && j.data) setFactura(j.data);
    } catch {
      /* ignorar */
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoadingF(true);
      setLoadErr(null);
      try {
        const res = await fetchWithSupabaseSession(`/api/facturas/${id}`);
        const j = (await res.json()) as { success?: boolean; data?: FacturaApiRow; error?: string };
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          setFactura(null);
          return;
        }
        if (!res.ok || !j.success || !j.data) {
          setLoadErr(j.error ?? "No se pudo cargar la factura");
          setFactura(null);
          return;
        }
        setNotFound(false);
        setFactura(j.data);
      } catch {
        if (!cancelled) setLoadErr("Error de red");
      } finally {
        if (!cancelled) setLoadingF(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoadingS(true);
      try {
        const res = await fetchWithSupabaseSession(`/api/facturas/${id}/sifen/resumen`);
        const j = (await res.json()) as { success?: boolean; data?: SifenResumen };
        if (cancelled) return;
        if (res.ok && j.success && j.data) setResumen(j.data);
        else setResumen(null);
      } catch {
        if (!cancelled) setResumen(null);
      } finally {
        if (!cancelled) setLoadingS(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (searchParams?.get("print") === "1" && factura && !loadingF) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [searchParams, factura, loadingF]);

  if (!id) {
    return null;
  }

  if (loadingF) {
    return (
      <div className="max-w-6xl mx-auto py-20 text-center text-sm text-slate-400">Cargando factura…</div>
    );
  }

  if (notFound) {
    return (
      <div className="max-w-6xl mx-auto py-20 text-center space-y-3">
        <p className="text-slate-600">Factura no encontrada.</p>
        <Link href="/gestion-clientes" className="text-[#0EA5E9] text-sm font-medium hover:underline">
          Volver a gestión de clientes
        </Link>
      </div>
    );
  }

  if (loadErr || !factura) {
    return (
      <div className="max-w-6xl mx-auto py-20 text-center space-y-3">
        <p className="text-red-600 text-sm">{loadErr ?? "Error"}</p>
        <Link href="/gestion-clientes" className="text-[#0EA5E9] text-sm font-medium hover:underline">
          Volver
        </Link>
      </div>
    );
  }

  const monedaLabel = factura.moneda === "USD" ? "USD" : "Gs.";

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-6 px-4 sm:px-6 print:px-0 w-full">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <Link
            href={`/gestion-clientes?cliente=${encodeURIComponent(factura.cliente_id)}`}
            className="text-xs font-medium text-[#0EA5E9] hover:underline"
          >
            ← Gestión de clientes
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Factura {factura.numero_factura}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cliente:{" "}
            <Link href={`/clientes/${factura.cliente_id}`} className="text-[#0EA5E9] font-medium hover:underline">
              {factura.cliente_display ?? "Ver cliente"}
            </Link>
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <EnviarWhatsappButton facturaId={id} disabled={factura.estado === "Anulado"} />
          <button
            type="button"
            onClick={() => window.print()}
            className="text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            Imprimir
          </button>
          <AnularFacturaButton
            facturaId={id}
            estado={factura.estado}
            variant="full"
            onAnulada={reloadFacturaComercial}
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-3">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Resumen comercial</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-slate-400 text-xs">Emisión</dt>
            <dd className="font-medium text-slate-800">{formatFecha(factura.fecha)}</dd>
          </div>
          <div>
            <dt className="text-slate-400 text-xs">Vencimiento</dt>
            <dd className="font-medium text-slate-800">{formatFecha(factura.fecha_vencimiento)}</dd>
          </div>
          <div>
            <dt className="text-slate-400 text-xs">Tipo</dt>
            <dd className="font-medium text-slate-800 capitalize">{factura.tipo}</dd>
          </div>
          <div>
            <dt className="text-slate-400 text-xs">Monto</dt>
            <dd className="font-semibold text-slate-900 tabular-nums">
              {monedaLabel}{" "}
              {factura.monto.toLocaleString(factura.moneda === "USD" ? "en-US" : "es-PY")}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400 text-xs">Saldo</dt>
            <dd className="font-semibold text-slate-900 tabular-nums">
              {monedaLabel}{" "}
              {factura.saldo.toLocaleString(factura.moneda === "USD" ? "en-US" : "es-PY")}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400 text-xs">Estado</dt>
            <dd className="font-medium text-slate-800">{factura.estado}</dd>
          </div>
        </dl>
      </div>

      <FacturaElectronicaPanel
        facturaId={id}
        clienteId={factura.cliente_id}
        facturaComercial={{
          monto: factura.monto,
          saldo: factura.saldo,
          estado: factura.estado,
          moneda: factura.moneda,
          cliente_display: factura.cliente_display ?? "",
        }}
        resumen={resumen}
        loadingResumen={loadingS}
        onResumenLoaded={onResumenLoaded}
        onComercialUpdated={reloadFacturaComercial}
      />
    </div>
  );
}

function EnviarWhatsappButton({ facturaId, disabled }: { facturaId: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function enviar() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetchWithSupabaseSession(`/api/facturas/${facturaId}/enviar-whatsapp`, {
        method: "POST",
      });
      const j = (await res.json()) as { success?: boolean; error?: string; data?: { to?: string } };
      if (!res.ok || !j.success) {
        setMsg({ kind: "err", text: j.error ?? `Error ${res.status}` });
      } else {
        setMsg({ kind: "ok", text: `Enviado al ${j.data?.to ?? "cliente"}.` });
      }
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Error de red" });
    } finally {
      setBusy(false);
      window.setTimeout(() => setMsg(null), 4000);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={enviar}
        disabled={busy || disabled}
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/60 bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-600 disabled:opacity-50"
        title={disabled ? "No se puede enviar una factura anulada" : "Enviar el recibo por WhatsApp al cliente"}
      >
        {/* icono simple de WhatsApp */}
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
          <path d="M20.5 3.5A11 11 0 0 0 3.4 17.2L2 22l4.9-1.3A11 11 0 1 0 20.5 3.5Zm-8.4 17a9 9 0 0 1-4.6-1.3l-.3-.2-2.9.8.8-2.8-.2-.3a9 9 0 1 1 7.2 3.8Zm5.1-6.7c-.3-.1-1.6-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1a7.4 7.4 0 0 1-3.7-3.2c-.3-.5.3-.5.8-1.6.1-.2 0-.3 0-.5 0-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5H8c-.2 0-.5.1-.7.3-.3.3-.9 1-.9 2.3 0 1.4 1 2.7 1.1 2.9.1.2 1.9 3 4.7 4.2 2.8 1.2 2.8.8 3.3.7.5-.1 1.6-.7 1.8-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.3Z"/>
        </svg>
        {busy ? "Enviando…" : "WhatsApp"}
      </button>
      {msg ? (
        <div
          className={`absolute right-0 top-full mt-1 whitespace-nowrap rounded-md border px-2 py-1 text-[11px] shadow-sm ${
            msg.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {msg.text}
        </div>
      ) : null}
    </div>
  );
}

export default function FacturaDetallePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-6xl mx-auto py-20 text-center text-sm text-slate-400">Cargando factura…</div>
      }
    >
      <FacturaDetalleInner />
    </Suspense>
  );
}
