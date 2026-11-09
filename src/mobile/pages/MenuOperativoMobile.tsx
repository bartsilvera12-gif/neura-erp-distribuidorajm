"use client";

import { etiquetaCamion } from "@/shared/caja/arqueo-ui";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowLeftRight,
  Boxes,
  ClipboardCheck,
  FileText,
  HandCoins,
  Package,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";
import { useRepartos } from "@/shared/hooks/useRepartos";
import { useAccesoRuta } from "@/shared/hooks/useAccesoRuta";
import { useUsuarioActual } from "@/shared/hooks/useUsuarioActual";
import { isErpRolAdministrador } from "@/lib/usuarios/erp-rol-normalize";

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
  /** Solo visible para el administrador (además del gate de módulo). */
  soloAdmin?: boolean;
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
  { href: "/camiones", label: "Camiones", icon: Truck, fondo: "#5B6B7A" },
  { href: "/inventario", label: "Inventario", icon: Boxes, fondo: "#3F8E91", soloAdmin: true },
  { href: "/compras", label: "Compras", icon: ShoppingCart, fondo: "#8A5A44", soloAdmin: true },
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
  const { puedeVer, cargando, error, recargar } = useAccesoRuta();
  const { usuario } = useUsuarioActual();
  const { repartos } = useRepartos({ abiertos: true });
  const esAdmin = isErpRolAdministrador(usuario?.rol);

  // Inventario y Compras en el celular son solo para el administrador y solo si
  // la empresa tiene el módulo habilitado (`puedeVer` ya chequea el módulo).
  const visibles = useMemo(
    () => TILES.filter((t) => puedeVer(t.href) === true && (!t.soloAdmin || esAdmin)),
    [puedeVer, esAdmin]
  );

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
        // Dos causas muy distintas: no se pudo leer (sin señal, sesión vencida)
        // o de verdad no tiene nada asignado. Decir cuál, y dar una salida.
        <div className="space-y-3 p-6 text-center text-sm text-slate-600">
          {error ? (
            <p>No se pudo cargar tu menú (sin conexión o sesión vencida).</p>
          ) : !usuario ? (
            <p>Tu sesión venció o tu usuario no está vinculado a la empresa. Volvé a entrar.</p>
          ) : (
            <p>
              Tu usuario no tiene módulos habilitados. Pedí a un administrador que los revise en Usuarios →{" "}
              {usuario.nombre ?? "tu usuario"}.
            </p>
          )}
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={recargar}
              className="rounded-xl bg-[#0B3A3D] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Reintentar
            </button>
            <Link href="/login" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700">
              Volver a entrar
            </Link>
          </div>
        </div>
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
