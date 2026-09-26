"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Modal de la caja: título, subtítulo, contenido y pie con dos acciones.
 *
 * Los formularios de la caja pasaron de paneles que empujaban la pantalla a
 * modales porque en el cierre lo que importa es el desglose —de dónde sale el
 * efectivo esperado— y ahí conviene tener la atención en una sola cosa.
 */
export default function ModalCaja({
  titulo,
  subtitulo,
  onCerrar,
  children,
  pie,
}: {
  titulo: string;
  subtitulo?: string;
  onCerrar: () => void;
  children: React.ReactNode;
  pie: React.ReactNode;
}) {
  // Escape cierra: el modal tapa la pantalla y quedarse encerrado por no
  // encontrar la X es la peor forma de perder una venta.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92svh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-6 pb-4 pt-5">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-900">{titulo}</h3>
            {subtitulo ? <p className="mt-0.5 text-sm text-slate-500">{subtitulo}</p> : null}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="-mr-1 shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-t border-slate-100 px-6 py-5">{children}</div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          {pie}
        </div>
      </div>
    </div>
  );
}
