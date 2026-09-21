"use client";

import { etiquetaCamion } from "@/shared/caja/arqueo-ui";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowLeftRight,
  ClipboardCheck,
  FileText,
  HandCoins,
  Package,
  Truck,
  Users,
} from "lucide-react";
import { useRepartos } from "@/shared/hooks/useRepartos";
import { useAccesoRuta } from "@/shared/hooks/useAccesoRuta";

/**
 * Menú operativo del celular: el que usa el repartidor en la calle.
 *
 * Pocas opciones, grandes, de un toque. Arriba, de qué camión y de quién es la
 * jornada — es el dato que ordena todo lo demás: la venta se estampa con ese
 * reparto y el stock sale de ese camión.
 *
 * Los colores vienen de la paleta Zentra. Cada tile tiene el suyo a propósito:
 * en la calle, con sol y apuro, el color se reconoce antes que el texto.
 */

type Tile = {
  href: string;
  label: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  fondo: string;
};

const TILES: Tile[] = [
  {
    href: "/ventas/nueva",
    label: "Nueva venta",
    sub: "Factura",
    icon: FileText,
    fondo: "#0B3A3D",
  },
  { href: "/clientes", label: "Clientes", icon: Users, fondo: "#2F7D82" },
  { href: "/cobranzas", label: "Cobranzas", icon: HandCoins, fondo: "#C77B30" },
  { href: "/ventas/stock-camion", label: "Stock del camión", icon: Package, fondo: "#4F6D9E" },
  { href: "/notas-credito", label: "Devoluciones", icon: ArrowLeftRight, fondo: "#B04B4B" },
  { href: "/ventas/arqueo", label: "Arqueo de caja", icon: ClipboardCheck, fondo: "#4FAEB2" },
  { href: "/ventas/cierre", label: "Cierre de reparto", icon: Truck, fondo: "#5B6B7A" },
];

const FECHA = new Intl.DateTimeFormat("es-PY", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Asuncion",
});

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function MenuOperativoMobile() {
  const { puedeVer, cargando } = useAccesoRuta();
  const { repartos } = useRepartos({ abiertos: true });

  const visibles = useMemo(() => TILES.filter((t) => puedeVer(t.href) === true), [puedeVer]);

  const hoy = capitalizar(FECHA.format(new Date()));
  const enCalle = repartos[0] ?? null;

  return (
    <div className="min-h-full bg-slate-100 pb-4">
      <header className="bg-[#0B3A3D] px-4 pb-5 pt-4 text-center text-white">
        {enCalle ? (
          <p className="text-base font-semibold">
            {etiquetaCamion(enCalle.camion)}
            {enCalle.repartidor ? (
              <span className="font-normal text-[#7DCFD2]"> · {enCalle.repartidor}</span>
            ) : null}
          </p>
        ) : (
          <p className="text-base font-semibold text-[#7DCFD2]">Sin reparto abierto</p>
        )}
        <p className="mt-0.5 text-xs text-slate-300">{hoy}</p>
      </header>

      {cargando ? (
        <p className="p-8 text-center text-sm text-slate-400">Cargando menú…</p>
      ) : visibles.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-500">
          Tu usuario no tiene módulos habilitados. Pedí a un administrador que los revise.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 p-3">
          {visibles.map((t, i) => {
            const Icon = t.icon;
            // El último impar ocupa el ancho completo, como en el menú de reparto:
            // deja la fila cerrada en vez de con un hueco.
            const solo = i === visibles.length - 1 && visibles.length % 2 === 1;
            return (
              <li key={t.href} className={solo ? "col-span-2" : undefined}>
                <Link
                  href={t.href}
                  className="flex h-28 flex-col items-center justify-center gap-2 rounded-2xl px-3 text-center text-white shadow-sm active:scale-[0.98] active:opacity-90"
                  style={{ backgroundColor: t.fondo }}
                >
                  <Icon className="h-7 w-7" />
                  <span className="text-sm font-semibold leading-tight">
                    {t.label}
                    {t.sub ? (
                      <span className="block text-xs font-normal opacity-80">({t.sub})</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
