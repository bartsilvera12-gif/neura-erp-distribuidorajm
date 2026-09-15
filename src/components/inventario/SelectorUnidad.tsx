"use client";

import { useMemo, useState } from "react";
import { UNIDADES } from "@/lib/inventario/unidades";

/**
 * Unidad de medida de un producto.
 *
 * Era texto libre en el alta y la edición de productos, y un `select` con otra
 * lista en el alta rápida de Compras. El mismo producto terminaba como "KG"
 * desde un lado y "Kg" desde el otro, y todo lo que agrupa por unidad —el
 * control de mercadería, el cierre de reparto— los lee como dos unidades
 * distintas.
 *
 * Acá hay una sola lista, en mayúsculas, que es como ya la guardaban las dos
 * pantallas de inventario.
 *
 * "Otra…" queda porque la lista no puede preverlo todo, y porque un producto
 * guardado antes con una unidad rara tiene que poder seguir editándose sin que
 * el formulario le cambie el valor por su cuenta.
 */

// La lista vive en `@/lib/inventario/unidades` porque el flujo de venta también
// la necesita para saber qué productos se venden al peso.
export { UNIDADES };

const OTRA = "__otra__";

export default function SelectorUnidad({
  value,
  onChange,
  className = "",
  id,
  required = false,
}: {
  value: string;
  onChange: (valor: string) => void;
  className?: string;
  id?: string;
  required?: boolean;
}) {
  const normalizado = (value ?? "").trim().toUpperCase();
  const enLista = UNIDADES.includes(normalizado as (typeof UNIDADES)[number]);

  // Un valor viejo fuera de la lista se ofrece igual: si no, abrir el producto
  // para cambiarle el precio le cambiaría la unidad de paso.
  const opciones = useMemo(
    () => (normalizado && !enLista ? [normalizado, ...UNIDADES] : [...UNIDADES]),
    [normalizado, enLista]
  );

  const [libre, setLibre] = useState(false);

  if (libre) {
    return (
      <div className="flex gap-2">
        <input
          type="text"
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder="Ej: FARDO"
          className={`${className} uppercase`}
          required={required}
          autoFocus
        />
        <button
          type="button"
          onClick={() => {
            setLibre(false);
            onChange("UNIDAD");
          }}
          className="shrink-0 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Ver lista
        </button>
      </div>
    );
  }

  return (
    <select
      id={id}
      value={normalizado || "UNIDAD"}
      onChange={(e) => {
        if (e.target.value === OTRA) {
          setLibre(true);
          onChange("");
          return;
        }
        onChange(e.target.value);
      }}
      className={className}
      required={required}
    >
      {opciones.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
      <option value={OTRA}>Otra…</option>
    </select>
  );
}
