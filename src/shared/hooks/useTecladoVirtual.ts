"use client";

import { useEffect, useState } from "react";

/**
 * `true` mientras el teclado del celular está abierto tapando pantalla.
 *
 * Hace falta porque en iOS el teclado NO achica el viewport de layout: `100svh`
 * y `window.innerHeight` siguen valiendo lo mismo, así que el encabezado, la
 * barra de acción fija y la barra inferior mantienen su altura y, con lo que
 * queda de pantalla, se comen entera la zona de contenido. El resultado era una
 * búsqueda donde no se veía ni el campo ni los resultados: solo el encabezado,
 * los botones y el teclado.
 *
 * `visualViewport` sí refleja lo que se ve. La diferencia contra `innerHeight`
 * es la altura del teclado.
 *
 * En Android el teclado achica el viewport de layout, así que la diferencia da
 * cerca de cero y esto devuelve `false`: ahí no hace falta esconder nada porque
 * el layout ya se reacomodó solo.
 */
export function useTecladoVirtual(): boolean {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;

    const revisar = () => {
      // 150px: más alto que cualquier barra del navegador que aparece y
      // desaparece al hacer scroll, más bajo que cualquier teclado.
      setAbierto(window.innerHeight - vv.height > 150);
    };

    revisar();
    vv.addEventListener("resize", revisar);
    vv.addEventListener("scroll", revisar);
    return () => {
      vv.removeEventListener("resize", revisar);
      vv.removeEventListener("scroll", revisar);
    };
  }, []);

  return abierto;
}
