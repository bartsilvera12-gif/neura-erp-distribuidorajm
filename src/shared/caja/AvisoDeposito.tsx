"use client";

import { useEffect, useRef } from "react";
import { Wallet, X } from "lucide-react";
import { formatGs, type CajaVenta } from "@/shared/caja/useCajaVenta";

/**
 * «Pasar a venta» desde Recibos abre la caja con `?deposito=<id>`: se carga el
 * depósito (y su cliente) una sola vez y se limpia la URL, para que recargar
 * la página o la venta siguiente no lo vuelvan a aplicar.
 */
export function useDepositoDesdeUrl(caja: CajaVenta) {
  const hecho = useRef(false);
  const { cargarDeposito } = caja;
  useEffect(() => {
    if (hecho.current) return;
    hecho.current = true;
    const url = new URL(window.location.href);
    const id = url.searchParams.get("deposito");
    if (!id) return;
    url.searchParams.delete("deposito");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    void cargarDeposito(id);
  }, [cargarDeposito]);
}

/** El depósito con que se paga la venta: cuánto se usa y cuánto queda por cobrar. */
export default function AvisoDeposito({ caja, quitable = true }: { caja: CajaVenta; quitable?: boolean }) {
  const d = caja.deposito;
  if (!d) return null;
  const sobra = d.saldo - caja.depositoAplicado;
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
      <div className="flex items-start gap-2">
        <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            Depósito {d.recibo_numero} · saldo {formatGs(d.saldo)}
          </p>
          {caja.totales.total > 0 ? (
            <p className="mt-0.5 text-xs text-emerald-800">
              Se usa {formatGs(caja.depositoAplicado)}
              {caja.aCobrar > 0 ? (
                <>
                  {" "}
                  · a cobrar <b>{formatGs(caja.aCobrar)}</b>
                </>
              ) : (
                <> · no hay nada que cobrar</>
              )}
              {sobra > 0 ? <> · le queda {formatGs(sobra)} a favor</> : null}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-emerald-800">Cargá los productos: el depósito paga la venta.</p>
          )}
        </div>
        {quitable ? (
          <button
            type="button"
            onClick={caja.quitarDeposito}
            title="No usar el depósito en esta venta"
            aria-label="Quitar depósito"
            className="shrink-0 rounded p-0.5 text-emerald-700 hover:bg-emerald-100"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
