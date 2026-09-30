"use client";

import { useUsuarioActual } from "@/shared/hooks/useUsuarioActual";
import { esSoloCaja } from "@/lib/usuarios/solo-caja";

/** `true` si el usuario logueado es de solo caja (rol `cajero`). */
export function useSoloCaja(): boolean {
  const { usuario } = useUsuarioActual();
  return esSoloCaja(usuario?.rol);
}
