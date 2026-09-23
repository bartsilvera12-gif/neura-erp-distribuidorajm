import type { NivelUsuario } from "@/lib/usuarios/types";

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

/**
 * Roles que el formulario de usuarios ofrece, en su forma canónica.
 *
 * Es la misma lista que `NIVEL_OPTIONS` en `UsuarioForm`: si la UI ofrece un
 * nivel que la API no acepta, guardar ese usuario falla con "Rol inválido"
 * aunque no se esté tocando el rol —basta con apretar guardar—, que es
 * exactamente lo que pasó cuando se agregó Vendedor Móvil acá pero no allá.
 */
const COBERTURA_NIVELES: Record<NivelUsuario, true> = {
  usuario: true,
  vendedor_movil: true,
  supervisor: true,
  administrador: true,
};

export const ROLES_ERP = Object.keys(COBERTURA_NIVELES) as NivelUsuario[];

/**
 * Forma canónica de un rol, o `null` si no es un rol conocido.
 *
 * Acepta las variantes que puedan existir en la base ("vendedor movil",
 * "vendedor móvil") y las lleva al slug único. `admin` y `super_admin` se
 * aceptan pero se devuelven tal cual: son válidos y equivalentes, y
 * reescribirlos le cambiaría el rol guardado a alguien que sólo pidió
 * cambiar otra cosa (el estado, el teléfono).
 */
export function canonicalErpRol(rol: string | null | undefined): string | null {
  const r = normalizeErpRolSlug(rol);
  if (!r) return null;
  if (isErpRolVendedorMovil(r)) return "vendedor_movil";
  if (r === "usuario" || r === "supervisor" || r === "administrador") return r;
  if (r === "admin" || r === "super_admin") return r;
  return null;
}
