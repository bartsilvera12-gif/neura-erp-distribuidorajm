/**
 * Ítems que no se muestran en el menú pero cuyas rutas siguen abiertas.
 *
 * Ocultar acá NO es un permiso: quien escriba la URL entra igual, y las
 * pantallas siguen funcionando. Es sólo para sacar del menú lo que la
 * operación diaria no usa, sin romper los links internos que apuntan ahí.
 * Si hace falta cerrar el acceso de verdad, eso va por módulos/permisos.
 */

/** `MenuItem.key` del Sidebar. */
export const ITEMS_OCULTOS_EN_MENU: ReadonlySet<string> = new Set<string>(["configuracion"]);

/** Prefijos de ruta que no se ofrecen en la navegación mobile. */
export const RUTAS_OCULTAS_EN_NAV: readonly string[] = ["/configuracion"];

export function estaOcultoEnMenu(key: string): boolean {
  return ITEMS_OCULTOS_EN_MENU.has(key);
}

export function rutaOcultaEnNav(href: string): boolean {
  return RUTAS_OCULTAS_EN_NAV.some((r) => href === r || href.startsWith(r + "/"));
}
