"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ReceiptText, Settings } from "lucide-react";
import { useAccesoRuta } from "@/shared/hooks/useAccesoRuta";
import { useTecladoVirtual } from "@/shared/hooks/useTecladoVirtual";

/**
 * Navegación inferior de la UI mobile.
 *
 * Tres secciones: Inicio (el menú de tiles), Órdenes de venta y Configuración.
 * Todo lo demás se alcanza desde los tiles de Inicio, que es como se usa en la
 * calle: pocas opciones grandes.
 *
 * Órdenes de venta está acá y no Reportes porque es lo que se abre varias veces
 * por jornada: ver lo que se vendió y anular la venta que salió mal. Los
 * reportes se miran en la computadora, al final del día.
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
  { href: "/ventas", label: "Órdenes de venta", icon: ReceiptText, matchPrefix: "/ventas" },
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
  // Con el teclado abierto no queda pantalla para nada: la barra se va y vuelve
  // al cerrarlo. Escribiendo no se navega a otra sección.
  const teclado = useTecladoVirtual();

  const isActive = (item: NavItem): boolean => {
    if (item.matchPrefix) {
      return pathname === item.matchPrefix || pathname.startsWith(item.matchPrefix + "/");
    }
    return pathname === item.href;
  };

  const visibles = NAV_ITEMS.filter((item) => puedeVer(item.href) === true);

  if (teclado) return null;

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
