"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, HelpCircle, LogOut } from "lucide-react";
import { signOut } from "@/lib/auth";
import { useUsuarioActual } from "@/shared/hooks/useUsuarioActual";

/**
 * Header mobile: 48px de alto, sticky top.
 *
 * Sin botón de menú: la navegación del celular es el menú de tiles de Inicio y
 * la barra inferior, como el ERP de reparto del cliente. Por eso "Cerrar
 * sesión" pasó al avatar — era lo único que solo vivía en el menú lateral, y
 * sacarlo dejaría al repartidor sin forma de salir.
 *
 * Usa el hook compartido useUsuarioActual (SWR con dedupe largo) para no
 * disparar una request por cada navegación entre pantallas mobile.
 */

export default function MobileHeader() {
  const router = useRouter();
  const { usuario } = useUsuarioActual();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  const avatarInitial = (usuario?.nombre ?? usuario?.email ?? "U").trim().charAt(0).toUpperCase();

  // Cerrar al tocar fuera: en el celular no hay Escape.
  useEffect(() => {
    if (!menuAbierto) return;
    const fuera = (e: MouseEvent | TouchEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) {
        setMenuAbierto(false);
      }
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("touchstart", fuera);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("touchstart", fuera);
    };
  }, [menuAbierto]);

  async function handleSalir() {
    await signOut();
    router.push("/login");
  }

  return (
    <header className="z-30 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-sm">
      <h1 className="truncate text-sm font-semibold tracking-tight text-[#0F172A]">
        Distribuidora JM
      </h1>

      <div className="flex items-center gap-1">
        <Link
          href="/ayuda"
          aria-label="Ayuda en línea"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-[#475569] transition-colors hover:bg-slate-50"
        >
          <HelpCircle className="h-5 w-5" />
        </Link>
        <button
          type="button"
          aria-label="Notificaciones"
          className="relative flex h-11 w-11 items-center justify-center rounded-lg text-[#475569] transition-colors hover:bg-slate-50"
        >
          <Bell className="h-5 w-5" />
        </button>

        <div className="relative" ref={contenedor}>
          <button
            type="button"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-label={usuario?.nombre ?? "Cuenta"}
            aria-expanded={menuAbierto}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--zentra-sidebar)] text-[13px] font-bold text-white ring-1 ring-[#7DCFD2]/40"
          >
            {avatarInitial}
          </button>

          {menuAbierto ? (
            <div className="absolute right-0 top-10 z-50 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              <div className="border-b border-slate-100 px-3 py-2.5">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {usuario?.nombre ?? "Usuario"}
                </p>
                {usuario?.email ? (
                  <p className="truncate text-xs text-slate-500">{usuario.email}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleSalir}
                className="flex w-full items-center gap-2 px-3 py-3 text-left text-sm font-medium text-slate-700 active:bg-slate-50"
              >
                <LogOut className="h-4 w-4 text-slate-400" />
                Cerrar sesión
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
