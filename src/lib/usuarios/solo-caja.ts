import { isErpRolCajero } from "@/lib/usuarios/erp-rol-normalize";

/**
 * Usuario de solo caja (rol `cajero`): entra directo a la caja y no ve el
 * resto del sistema. Sin sidebar, sin barra de abajo en el celular; si llega a
 * otra pantalla (un link, la dirección escrita a mano), vuelve a la caja.
 */

/** Pantalla de inicio del cajero. */
export const INICIO_CAJERO = "/ventas/nueva";

/** Lo único que el cajero puede abrir: la caja y su arqueo (apertura y cierre). */
const RUTAS_CAJERO = ["/ventas/nueva", "/ventas/arqueo"];

export function esSoloCaja(rol: string | null | undefined): boolean {
  return isErpRolCajero(rol);
}

export function rutaPermitidaCajero(pathname: string): boolean {
  const p = pathname.split("?")[0];
  return RUTAS_CAJERO.some((r) => p === r || p.startsWith(`${r}/`));
}
