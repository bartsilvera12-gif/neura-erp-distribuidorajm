"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Pantalla de error de las pantallas de venta.
 *
 * Sin esto, cualquier excepción del navegador deja la pantalla en blanco con
 * "Application error: a client-side exception has occurred", que al vendedor no
 * le dice nada y al que tiene que arreglarlo, tampoco. Acá al menos se puede
 * reintentar, volver, y leer el mensaje para contarlo.
 */
export default function ErrorVentas({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // A la consola va el error entero: el mensaje que se ve en pantalla entra en
  // una línea, pero para arreglarlo hace falta la traza.
  useEffect(() => {
    console.error("[ventas] pantalla caída:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
        <AlertTriangle className="h-7 w-7 text-amber-600" />
      </div>
      <h1 className="mt-4 text-lg font-bold text-slate-900">No se pudo mostrar esta pantalla</h1>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        Se cortó al cargar los datos. Probá de nuevo; si sigue igual, recargá la página —después de
        una actualización el navegador puede quedarse con la versión vieja— y si aún así falla,
        pasá el detalle de abajo.
      </p>

      <pre className="mt-4 max-w-full overflow-x-auto rounded-lg bg-slate-100 p-3 text-left text-[11px] text-slate-600">
        {error.message}
        {error.digest ? `\n(${error.digest})` : ""}
      </pre>

      <div className="mt-5 flex w-full max-w-xs flex-col gap-2">
        <button
          type="button"
          onClick={reset}
          className="w-full rounded-xl py-3 text-sm font-semibold text-white"
          style={{ backgroundColor: "#4FAEB2" }}
        >
          Reintentar
        </button>
        <button
          type="button"
          // Recarga de verdad, sin la caché del router: es lo que arregla un
          // navegador que quedó con archivos de una versión anterior.
          onClick={() => window.location.reload()}
          className="w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-600"
        >
          Recargar la página
        </button>
        <Link
          href="/"
          className="w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-600"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
