"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Muestra la hoja A4 (210 mm ≈ 794 px) entera en cualquier pantalla: en el
 * celular se achica con `zoom` para que entre a lo ancho, sin scroll lateral.
 * Al imprimir el zoom se anula (globals.css) y sale a tamaño real.
 */
export default function HojaA4({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ajustar = () => setZoom(Math.min(1, el.clientWidth / 794));
    ajustar();
    const ro = new ResizeObserver(ajustar);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="w-full">
      <div
        className="hoja-a4 mx-auto w-[794px] bg-white p-[38px] shadow-sm ring-1 ring-slate-200"
        style={{ zoom }}
      >
        {children}
      </div>
    </div>
  );
}
