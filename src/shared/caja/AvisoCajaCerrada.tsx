"use client";

import Link from "next/link";
import { Lock } from "lucide-react";

/**
 * Sin caja abierta no se cobra, igual que el resto del ERP. Se avisa en la
 * pantalla además de validarlo en la API: que el cajero se entere al confirmar
 * sería tarde, ya tiene el carrito cargado.
 */
export default function AvisoCajaCerrada() {
  return (
    <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div className="text-xs leading-relaxed text-amber-900">
        <p className="font-semibold">No hay una caja abierta</p>
        <p className="mt-1">
          Para cobrar de contado hace falta una caja abierta. Una venta a crédito sí se puede
          registrar, porque no entra plata ahora.
        </p>
        <Link href="/ventas" className="mt-2 inline-block font-semibold underline">
          Ir a Caja
        </Link>
      </div>
    </div>
  );
}
