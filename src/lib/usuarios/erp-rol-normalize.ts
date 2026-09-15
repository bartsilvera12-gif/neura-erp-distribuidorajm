/**
 * Valores funcionales de `usuarios.rol` en el ERP (creación vía UI/API en minúsculas).
 * En bases heredadas puede haber distinto casing o espacios; siempre comparar normalizado.
 */
export function normalizeErpRolSlug(rol: string | null | undefined): string {
  return (rol ?? "").trim().toLowerCase().normalize("NFC");
}

export function isErpRolSupervisor(rol: string | null | undefined): boolean {
  return normalizeErpRolSlug(rol) === "supervisor";
}

export function isErpRolUsuario(rol: string | null | undefined): boolean {
  return normalizeErpRolSlug(rol) === "usuario";
}

export function isErpRolAdministrador(rol: string | null | undefined): boolean {
  const r = normalizeErpRolSlug(rol);
  return r === "administrador" || r === "admin";
}

export function isErpRolVendedor(rol: string | null | undefined): boolean {
  const r = normalizeErpRolSlug(rol);
  return r === "vendedor" || r === "asesor" || r === "comercial" || r === "asesor comercial";
}

/**
 * Vendedor móvil: el repartidor que sale con el camión.
 *
 * "vendedor" a secas es el rol comercial de mostrador que ya existía; el móvil
 * es otro y se distingue, porque es el único al que se le acota la vista a sus
 * propios repartos.
 */
export function isErpRolVendedorMovil(rol: string | null | undefined): boolean {
  const r = normalizeErpRolSlug(rol);
  return r === "vendedor_movil" || r === "vendedor movil" || r === "vendedor móvil";
}

/**
 * Qué repartos puede ver y tocar este rol.
 *
 * El vendedor móvil solo los suyos: ver el camión de otro le mostraría stock que
 * no maneja, y cerrarlo le cerraría la jornada a un compañero. Supervisor y
 * administrador ven todos, que es justo el control que pide el documento.
 */
export function alcanceRepartos(rol: string | null | undefined): "propios" | "todos" {
  return isErpRolVendedorMovil(rol) ? "propios" : "todos";
}
