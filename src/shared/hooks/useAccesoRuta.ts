"use client";

import { useCallback } from "react";
import { useMisModulos } from "@/shared/hooks/useMisModulos";
import { isModuleSlugGranted, pathRequiresModuleSlug } from "@/lib/modulos/route-slug-map";

/**
 * ¿Puede este usuario entrar a esta ruta?
 *
 * Misma decisión que toma el sidebar desktop, para que la navegación mobile no
 * ofrezca módulos que la empresa no tiene. Antes el menú mobile los mostraba
 * todos y dejaba que el routing rechazara al tocarlos: en un ERP con la mitad
 * de los módulos habilitados, eso es un menú lleno de puertas cerradas.
 *
 * `null` mientras no se sabe: sirve para no dibujar el menú completo un
 * instante y después recortarlo.
 */
export function useAccesoRuta() {
  const { modulos, isLoading } = useMisModulos();

  const puedeVer = useCallback(
    (href: string): boolean | null => {
      const slug = pathRequiresModuleSlug(href);
      // Sin gate de módulo (ayuda, login): entra cualquiera con sesión.
      if (slug === null) return true;
      if (isLoading) return null;
      const slugs = new Set(modulos.map((m) => (m.slug ?? "").trim().toLowerCase()));
      return isModuleSlugGranted(slug, slugs);
    },
    [modulos, isLoading]
  );

  return { puedeVer, cargando: isLoading };
}
