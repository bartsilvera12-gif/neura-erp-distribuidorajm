"use client";

import { useEffect, useState } from "react";

/**
 * `true` mientras el teclado del celular está abierto tapando pantalla.
 *
 * Hace falta porque en iOS el teclado no reacomoda el layout: el encabezado de
 * la app, el de la pantalla, la barra de acción y la barra inferior mantienen su
 * altura y, con lo poco que deja el teclado, entre todas tapan el campo de
 * búsqueda y sus resultados.
 *
 * Se detecta por DOS caminos, porque uno solo no alcanza:
 *
 *  1. Foco en un campo de texto, en un dispositivo táctil. Es el más confiable:
 *     si alguien tocó un campo en un celular, el teclado está arriba. No depende
 *     de medir nada.
 *
 *  2. La pantalla visible se achicó mucho. Cubre el caso de un teclado que
 *     aparece sin foco en un input (dictado, autocompletado del navegador).
 *     La referencia es la altura MÁXIMA vista, no `window.innerHeight`: en iOS
 *     `innerHeight` también se achica con el teclado, así que restar una de la
 *     otra daba cero y la detección nunca se disparaba. Ese fue el bug de la
 *     primera versión de este hook.
 */

/** Los campos que abren teclado. Un checkbox o un botón no. */
function abreTeclado(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  if (tag !== "INPUT") return false;
  const tipo = (el as HTMLInputElement).type;
  return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(
    tipo
  );
}

/**
 * La decisión, separada del DOM para poder probarla.
 *
 * Cuando se puede MEDIR la pantalla, la medida manda y el foco no se mira: el
 * teclado de Android se cierra con el botón de atrás sin sacar el foco del
 * campo, y mirando el foco la app se quedaba creída de que seguía abierto —con
 * la pantalla contraída y en blanco— hasta que se tocaba en cualquier lado. El
 * foco queda solo de respaldo para navegadores sin `visualViewport`.
 */
export function tecladoAbierto(estado: {
  medible: boolean;
  achicada: boolean;
  tactil: boolean;
  enfocado: boolean;
}): boolean {
  if (estado.medible) return estado.achicada;
  return estado.tactil && estado.enfocado;
}

export function useTecladoVirtual(): boolean {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const tactil = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const vv = window.visualViewport;

    // Alto de referencia: el mayor visto sin teclado. Se actualiza solo cuando
    // no hay nada enfocado, para no tomar como referencia una pantalla ya
    // achicada por el teclado.
    let referencia = vv?.height ?? window.innerHeight;

    const revisar = () => {
      const enfocado = abreTeclado(document.activeElement);
      const alto = vv?.height ?? window.innerHeight;

      // La referencia solo crece, así que subirla es siempre señal de pantalla
      // sin teclado. Antes esto pedía además que no hubiera nada enfocado, y
      // con el campo todavía enfocado al cerrarse el teclado la referencia
      // quedaba vieja y la pantalla no se recuperaba.
      if (alto > referencia) referencia = alto;

      const achicada = referencia - alto > 150;
      setAbierto(tecladoAbierto({ medible: !!vv, achicada, tactil, enfocado }));
    };

    revisar();
    document.addEventListener("focusin", revisar);
    document.addEventListener("focusout", revisar);
    vv?.addEventListener("resize", revisar);
    vv?.addEventListener("scroll", revisar);
    window.addEventListener("orientationchange", revisar);

    return () => {
      document.removeEventListener("focusin", revisar);
      document.removeEventListener("focusout", revisar);
      vv?.removeEventListener("resize", revisar);
      vv?.removeEventListener("scroll", revisar);
      window.removeEventListener("orientationchange", revisar);
    };
  }, []);

  return abierto;
}
