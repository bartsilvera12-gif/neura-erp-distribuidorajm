"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";
import type { Producto } from "@/lib/inventario/types";

/**
 * Foto del producto, del tamaño que pida la pantalla.
 *
 * Sin foto —o con la URL firmada ya vencida— muestra la inicial del nombre en
 * vez de un ícono roto: en una lista de carne el vendedor distingue igual el
 * muslo de la milanesa, y un cuadrado gris idéntico en cada fila no ayuda a
 * nadie.
 */
export default function MiniaturaProducto({
  producto,
  size = "md",
}: {
  producto: Pick<Producto, "nombre" | "imagen_url">;
  size?: "sm" | "md";
}) {
  const [falla, setFalla] = useState(false);
  const caja = size === "sm" ? "h-10 w-10 text-xs" : "h-12 w-12 text-sm";
  const inicial = producto.nombre.trim().charAt(0).toUpperCase();
  const url = producto.imagen_url;

  return (
    <div
      className={`${caja} flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 font-bold text-slate-400`}
      aria-hidden="true"
    >
      {url && !falla ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          onError={() => setFalla(true)}
          className="h-full w-full object-cover"
        />
      ) : inicial ? (
        inicial
      ) : (
        <ImageIcon className="h-4 w-4 text-slate-300" />
      )}
    </div>
  );
}
