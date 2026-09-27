"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Search } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/** Lo que devuelve `/api/set/consulta-ruc`. */
export type DatosSet = {
  ruc: string;
  dv: string;
  razon_social: string;
  nombre_comercial: string | null;
  tipo_persona: string | null;
  estado: string | null;
  categoria: string | null;
  tipo_cliente: "empresa" | "persona";
  dv_calculado: boolean;
};

/**
 * "Consultar en la SET": trae razón social, tipo de persona y estado del RUC
 * desde el servicio de Consulta Pública de la DNIT y se los pasa al formulario.
 *
 * El resultado queda a la vista debajo del botón —qué razón social trajo y en
 * qué estado está el contribuyente— para que se vea qué se completó y, sobre
 * todo, si el RUC está suspendido o cancelado antes de venderle a crédito.
 */
export default function ConsultarSetButton({
  valor,
  onDatos,
  etiqueta = "Consultar en la SET",
}: {
  /** Lo que está escrito en el campo: "80012345-6", "80012345" o una CI. */
  valor: string;
  onDatos: (d: DatosSet) => void;
  etiqueta?: string;
}) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<DatosSet | null>(null);

  async function consultar() {
    if (cargando) return;
    const v = valor.trim();
    if (!v) {
      setError("Escribí primero el RUC o la CI.");
      setOk(null);
      return;
    }
    setCargando(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetchWithSupabaseSession(
        `/api/set/consulta-ruc?ruc=${encodeURIComponent(v)}`,
        { cache: "no-store" }
      );
      const j = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: DatosSet;
        error?: string;
      };
      if (!res.ok || !j.success || !j.data) {
        setError(j.error ?? "No se pudo consultar la SET.");
        return;
      }
      setOk(j.data);
      onDatos(j.data);
    } catch {
      setError("No se pudo consultar la SET. Revisá la conexión.");
    } finally {
      setCargando(false);
    }
  }

  const activo = (ok?.estado ?? "").toUpperCase() === "ACTIVO";

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={consultar}
        disabled={cargando}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#4FAEB2]/50 bg-[#4FAEB2]/8 px-3 text-xs font-semibold text-[#3F8E91] transition-colors hover:bg-[#4FAEB2]/15 disabled:opacity-50"
      >
        {cargando ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Search className="h-3.5 w-3.5" />
        )}
        {cargando ? "Consultando…" : etiqueta}
      </button>

      {error ? (
        <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      ) : null}

      {ok ? (
        <div
          className={`mt-2 rounded-lg px-3 py-2 text-xs ${
            activo ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
          }`}
        >
          <p className="flex items-start gap-1.5 font-semibold">
            {activo ? (
              <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
            ) : (
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            )}
            <span>
              {ok.razon_social} · RUC {ok.ruc}-{ok.dv}
            </span>
          </p>
          <p className="mt-0.5 pl-5">
            {ok.tipo_persona === "FISICO" ? "Persona física" : "Persona jurídica"}
            {ok.estado ? ` · ${ok.estado}` : ""}
            {ok.nombre_comercial ? ` · Nombre comercial: ${ok.nombre_comercial}` : ""}
          </p>
          {!activo && ok.estado ? (
            <p className="mt-1 pl-5 font-medium">
              Ojo: el contribuyente no está activo en la SET. Revisalo antes de facturarle o
              venderle a crédito.
            </p>
          ) : null}
          {ok.dv_calculado ? (
            <p className="mt-1 pl-5 opacity-80">
              El dígito verificador ({ok.dv}) lo calculó el sistema.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
