"use client";

import { useEffect, useState } from "react";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import { CLAVE_PUNTO_FACTURA } from "@/shared/caja/FacturaSifen";

/**
 * Punto de facturación para el administrador: el del salón (001-004, el de
 * siempre) o el 001-001 de licitaciones. Solo lo ve el administrador. La
 * elección queda guardada en este navegador y se manda al emitir la factura.
 */
export default function SelectorPuntoFactura() {
  const { isAdmin } = useIsAdmin();
  const [punto, setPunto] = useState("");
  useEffect(() => {
    try {
      setPunto(localStorage.getItem(CLAVE_PUNTO_FACTURA) ?? "");
    } catch {
      /* sin almacenamiento */
    }
  }, []);
  if (!isAdmin) return null;

  function elegir(v: string) {
    setPunto(v);
    try {
      if (v) localStorage.setItem(CLAVE_PUNTO_FACTURA, v);
      else localStorage.removeItem(CLAVE_PUNTO_FACTURA);
    } catch {
      /* vale solo para esta vez */
    }
  }

  return (
    <label className="mt-3 block text-xs font-medium text-slate-600">
      Punto de facturación
      <select
        value={punto}
        onChange={(e) => elegir(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800"
      >
        <option value="">Salón (001-004)</option>
        <option value="001">Licitaciones (001-001)</option>
      </select>
    </label>
  );
}
