"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, ExternalLink, Loader2, Printer, RefreshCw } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import KudeTicket from "@/shared/caja/KudeTicket";

/**
 * Factura electrónica (SIFEN) de una venta de la caja.
 *
 * Al abrirse le pide al servidor que emita la factura de la venta (crearla,
 * firmarla y mandarla a la SET) y después pregunta cada pocos segundos hasta
 * que la SET la apruebe. Recién aprobada existe el KuDE oficial —con CDC y
 * QR—, y es lo que se imprime.
 *
 * Si SIFEN no está activo en la empresa, `estado` queda en "inactivo" y la
 * caja sigue con su comprobante de siempre.
 */

export type EstadoEmision =
  | "cargando"
  | "inactivo"
  | "enviando"
  | "esperando"
  | "demorado"
  | "aprobado"
  | "rechazado"
  | "error";

type Respuesta = {
  success?: boolean;
  error?: string;
  data?: {
    sifen_activo?: boolean;
    factura_id?: string;
    estado_sifen?: string | null;
    error?: string | null;
    cdc?: string | null;
  };
};

const CADA_MS = 4000;
const INTENTOS = 30; // ≈ 2 minutos

export function useEmisionSifen(ventaId: string | null, habilitado: boolean) {
  const [estado, setEstado] = useState<EstadoEmision>(habilitado ? "cargando" : "inactivo");
  const [facturaId, setFacturaId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const intentos = useRef(0);
  const vivo = useRef(true);

  const aplicar = useCallback((j: Respuesta, ok: boolean) => {
    const d = j.data ?? {};
    if (d.factura_id) setFacturaId(d.factura_id);
    if (ok && d.sifen_activo === false) {
      setEstado("inactivo");
      return "fin" as const;
    }
    const e = d.estado_sifen ?? null;
    if (e === "aprobado") {
      setEstado("aprobado");
      setMensaje(null);
      return "fin" as const;
    }
    if (e === "rechazado") {
      setEstado("rechazado");
      setMensaje(d.error ?? j.error ?? "La SET rechazó la factura.");
      return "fin" as const;
    }
    if (!ok) {
      setEstado("error");
      setMensaje(j.error ?? "No se pudo emitir la factura electrónica.");
      return "fin" as const;
    }
    return "seguir" as const;
  }, []);

  const consultar = useCallback(async () => {
    if (!ventaId || !vivo.current) return;
    try {
      const res = await fetchWithSupabaseSession(`/api/ventas/${ventaId}/sifen/estado`, { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as Respuesta;
      if (!vivo.current) return;
      if (aplicar(j, res.ok) === "fin") return;
    } catch {
      /* corte de red: se reintenta igual */
    }
    intentos.current += 1;
    if (intentos.current >= INTENTOS) {
      setEstado("demorado");
      return;
    }
    setEstado("esperando");
    setTimeout(() => void consultar(), CADA_MS);
  }, [ventaId, aplicar]);

  const emitir = useCallback(async () => {
    if (!ventaId) return;
    setEstado("enviando");
    setMensaje(null);
    intentos.current = 0;
    try {
      const res = await fetchWithSupabaseSession(`/api/ventas/${ventaId}/sifen/emitir`, { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as Respuesta;
      if (!vivo.current) return;
      if (aplicar(j, res.ok) === "fin") return;
      setEstado("esperando");
      setTimeout(() => void consultar(), CADA_MS);
    } catch (e) {
      setEstado("error");
      setMensaje(e instanceof Error ? e.message : "No se pudo conectar con el servidor.");
    }
  }, [ventaId, aplicar, consultar]);

  const reintentarConsulta = useCallback(() => {
    intentos.current = 0;
    setEstado("esperando");
    void consultar();
  }, [consultar]);

  useEffect(() => {
    vivo.current = true;
    if (habilitado && ventaId) void emitir();
    return () => {
      vivo.current = false;
    };
    // Una sola emisión por venta mostrada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventaId, habilitado]);

  return { estado, facturaId, mensaje, emitir, reintentarConsulta };
}

export type EmisionSifen = ReturnType<typeof useEmisionSifen>;

/** Cartel con el estado de la factura electrónica, para el resumen de la venta. */
export function EstadoFacturaSifen({
  emision,
  onVerKude,
}: {
  emision: EmisionSifen;
  onVerKude: () => void;
}) {
  const { estado, mensaje, facturaId } = emision;
  if (estado === "inactivo" || estado === "cargando") return null;

  if (estado === "enviando" || estado === "esperando") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-left">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-sky-600" />
        <div>
          <p className="text-sm font-semibold text-sky-900">
            {estado === "enviando" ? "Enviando la factura a la SET…" : "Esperando la aprobación de la SET…"}
          </p>
          <p className="text-xs text-sky-800">Suele tardar unos segundos. No cierres esta ventana.</p>
        </div>
      </div>
    );
  }

  if (estado === "aprobado") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          Factura electrónica aprobada por la SET
        </p>
        <button
          type="button"
          onClick={onVerKude}
          className="mt-3 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Ver e imprimir factura (KuDE)
        </button>
      </div>
    );
  }

  if (estado === "demorado") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left">
        <p className="text-sm font-semibold text-amber-900">La SET todavía no respondió.</p>
        <p className="mt-0.5 text-xs text-amber-800">
          La factura ya se envió. Podés volver a consultar ahora o más tarde desde Facturas.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={emision.reintentarConsulta}
            className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Consultar de nuevo
          </button>
          {facturaId ? (
            <Link
              href={`/facturas/${facturaId}`}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-amber-900 underline"
            >
              Abrir en Facturas
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  // rechazado / error
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left">
      <p className="flex items-center gap-2 text-sm font-semibold text-red-900">
        <AlertTriangle className="h-5 w-5 text-red-600" />
        {estado === "rechazado" ? "La SET rechazó la factura" : "No se pudo emitir la factura electrónica"}
      </p>
      {mensaje ? <p className="mt-1 break-words text-xs text-red-800">{mensaje}</p> : null}
      <p className="mt-1 text-xs text-red-800">La venta quedó registrada igual.</p>
      <div className="mt-2 flex gap-2">
        {estado === "error" ? (
          <button
            type="button"
            onClick={() => void emision.emitir()}
            className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-900"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reintentar
          </button>
        ) : null}
        {facturaId ? (
          <Link href={`/facturas/${facturaId}`} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-900 underline">
            Abrir en Facturas
          </Link>
        ) : null}
      </div>
    </div>
  );
}

type FormatoKude = "ticket" | "a4";
const CLAVE_FORMATO = "kude:formato";

function formatoGuardado(): FormatoKude {
  try {
    return localStorage.getItem(CLAVE_FORMATO) === "a4" ? "a4" : "ticket";
  } catch {
    return "ticket";
  }
}

/**
 * La factura electrónica aprobada, en ticket de 80 mm (para la impresora de
 * la caja) o en hoja A4 (el PDF oficial). Se recuerda el último formato.
 */
export function VisorKude({ facturaId }: { facturaId: string }) {
  const [formato, setFormato] = useState<FormatoKude>(formatoGuardado);

  function elegir(f: FormatoKude) {
    setFormato(f);
    try {
      localStorage.setItem(CLAVE_FORMATO, f);
    } catch {
      // Sin almacenamiento: vale solo para esta vez.
    }
  }

  return (
    <div>
      <div className="no-imprimir mb-3 flex justify-center">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
          {(
            [
              ["ticket", "Ticket 80mm"],
              ["a4", "Hoja A4"],
            ] as const
          ).map(([f, texto]) => (
            <button
              key={f}
              type="button"
              onClick={() => elegir(f)}
              aria-pressed={formato === f}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${
                formato === f ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {texto}
            </button>
          ))}
        </div>
      </div>
      {formato === "ticket" ? <KudeTicket facturaId={facturaId} /> : <KudePdf facturaId={facturaId} />}
    </div>
  );
}

/**
 * El KuDE (PDF oficial de la factura electrónica). Se baja con la sesión del
 * usuario y se muestra en la pantalla; Imprimir manda ese mismo PDF.
 */
function KudePdf({ facturaId }: { facturaId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let objeto: string | null = null;
    let cancelado = false;
    (async () => {
      try {
        const res = await fetchWithSupabaseSession(`/api/facturas/${facturaId}/sifen/kude`);
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `No se pudo obtener el KuDE (${res.status}).`);
        }
        const blob = await res.blob();
        objeto = URL.createObjectURL(blob);
        if (!cancelado) setUrl(objeto);
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : "No se pudo obtener el KuDE.");
      }
    })();
    return () => {
      cancelado = true;
      if (objeto) URL.revokeObjectURL(objeto);
    };
  }, [facturaId]);

  if (error) {
    return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  }
  if (!url) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando factura…
      </p>
    );
  }

  function imprimir() {
    const w = frame.current?.contentWindow;
    if (w) {
      w.focus();
      w.print();
    } else if (url) {
      window.open(url, "_blank");
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={imprimir}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          <Printer className="h-4 w-4" />
          Imprimir
        </button>
        <a
          href={url}
          download={`factura-${facturaId.slice(0, 8)}.pdf`}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" />
          Descargar
        </a>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          <ExternalLink className="h-4 w-4" />
          Abrir
        </a>
      </div>
      <iframe
        ref={frame}
        src={url}
        title="Factura electrónica (KuDE)"
        className="h-[75vh] w-full rounded-lg border border-slate-200 bg-white"
      />
    </div>
  );
}
