"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/cobranzas", label: "Créditos por cobrar", exacto: true },
  { href: "/cobranzas/recibos", label: "Recibos de dinero", exacto: false },
];

/** Pestañas de Cobranzas: sirven también en el celular. */
export default function CobranzasTabs() {
  const p = usePathname() ?? "";
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {TABS.map((t) => {
        const activo = t.exacto ? p === t.href : p.startsWith(t.href);
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
