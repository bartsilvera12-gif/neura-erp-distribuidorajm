"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/fetch-with-supabase-session";

export type BancoOpcion = { id: string; nombre: string };

/** Cuenta de la empresa: a dónde se le pide al cliente que transfiera. */
export type CuentaPropia = {
  id: string;
  nombre: string;
  numero_cuenta: string | null;
  titular_cuenta: string | null;
  documento_titular: string | null;
};

type BancoFila = {
  id: string; nombre: string; activo: boolean;
  es_cuenta_propia?: boolean | null;
  numero_cuenta?: string | null;
  titular_cuenta?: string | null;
  documento_titular?: string | null;
};

/**
 * Lista de bancos ACTIVOS de la empresa (catálogo de Configuración → Bancos).
 * Alimenta el desplegable "Banco de origen" de los botones de cobro. Se carga
 * cuando `enabled` es true (p. ej. al abrir el modal), no en cada render.
 */
export function useBancosActivos(enabled: boolean): {
  bancos: BancoOpcion[];
  cuentasPropias: CuentaPropia[];
  loading: boolean;
} {
  const [bancos, setBancos] = useState<BancoOpcion[]>([]);
  const [cuentasPropias, setCuentasPropias] = useState<CuentaPropia[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancel = false;
    setLoading(true);
    apiFetch("/api/configuracion/bancos", { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { data?: { bancos?: BancoFila[] } };
        if (cancel) return;
        const list = j?.data?.bancos ?? [];
        const activos = list.filter((b) => b.activo);
        // Una cuenta de la empresa es a dónde COBRAMOS, no un origen posible:
        // no tiene que aparecer en el desplegable "Banco de origen".
        setBancos(activos.filter((b) => !b.es_cuenta_propia).map((b) => ({ id: b.id, nombre: b.nombre })));
        setCuentasPropias(
          activos
            .filter((b) => b.es_cuenta_propia)
            .map((b) => ({
              id: b.id,
              nombre: b.nombre,
              numero_cuenta: b.numero_cuenta ?? null,
              titular_cuenta: b.titular_cuenta ?? null,
              documento_titular: b.documento_titular ?? null,
            }))
        );
      })
      .catch(() => {
        if (!cancel) { setBancos([]); setCuentasPropias([]); }
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [enabled]);

  return { bancos, cuentasPropias, loading };
}
