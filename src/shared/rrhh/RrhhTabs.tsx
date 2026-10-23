"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/rrhh/funcionarios", label: "Funcionarios" },
  { href: "/rrhh/salarios", label: "Pagos de salarios" },
  { href: "/rrhh/ips", label: "Pagos de IPS" },
  { href: "/usuarios", label: "Usuarios del sistema" },
];

/** Pestañas de RRHH: sirven también en el celular, donde no hay menú lateral con hijos. */
export default function RrhhTabs() {
  const p = usePathname();
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {TABS.map((t) => {
        const activo = p?.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${
              activo ? "border-[#4FAEB2] text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
