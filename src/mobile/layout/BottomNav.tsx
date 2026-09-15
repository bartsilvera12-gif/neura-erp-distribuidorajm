"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Home, Settings } from "lucide-react";
import { useAccesoRuta } from "@/shared/hooks/useAccesoRuta";

/**
 * Navegación inferior de la UI mobile.
 *
 * Tres secciones, como el menú de reparto del cliente: Inicio (el menú de
 * tiles), Reportes y Configuración. Todo lo demás se alcanza desde los tiles
 * de Inicio, que es como se usa en la calle: pocas opciones grandes.
 *
 * Sin botón "Más": el menú completo sigue a un toque del ☰ del header, así que
 * la barra queda limpia sin dejar encerrado a quien administra desde el celular.
 *
 * Cada pestaña respeta los módulos de la empresa: ofrecer Reportes a quien no
 * los tiene es ofrecer una puerta cerrada.
 */

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  matchPrefix?: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/reportes", label: "Reportes", icon: BarChart3, matchPrefix: "/reportes" },
  {
    href: "/configuracion",
    label: "Configuración",
    icon: Settings,
    matchPrefix: "/configuracion",
  },
];

export default function BottomNav() {
  const pathname = usePathname() ?? "/";
  const { puedeVer } = useAccesoRuta();

  const isActive = (item: NavItem): boolean => {
    if (item.matchPrefix) {
      return pathname === item.matchPrefix || pathname.startsWith(item.matchPrefix + "/");
    }
    return pathname === item.href;
  };

  const visibles = NAV_ITEMS.filter((item) => puedeVer(item.href) === true);

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex h-14 max-w-3xl items-stretch justify-around">
        {visibles.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full min-h-[44px] flex-col items-center justify-center gap-0.5 px-1 transition-colors ${
                  active ? "text-[#4FAEB2]" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span className="text-[10px] font-medium tracking-tight">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
