import { normalizeErpRolSlug } from "@/lib/usuarios/erp-rol-normalize";

/**
 * Permisos por acción (documento v0.2, pág. 10).
 *
 * Los permisos del ERP tenían dos niveles: el módulo —¿ve Caja?— y el alcance
 * del rol —¿ve los repartos de todos o solo los suyos?—. Esto es el tercero:
 * qué puede hacer dentro de un módulo que ya ve.
 *
 * El catálogo vive acá y no en la base a propósito: cada acción de esta lista
 * está chequeada en su endpoint. Una fila de catálogo que el código no mira es
 * un permiso que no existe, y en una pantalla se leería como si existiera.
 *
 * Por eso la lista es corta: son las nueve acciones que hoy se pueden negar de
 * verdad. Cuando aparezca una acción nueva se agrega acá y se chequea allá.
 */

export const ACCIONES = [
  "venta.credito",
  "reparto.abrir",
  "reparto.cerrar",
  "reparto.cargar",
  "reparto.transferir",
  "reparto.objetivo",
  "camion.administrar",
  "caja.abrir",
  "caja.cerrar",
] as const;

export type Accion = (typeof ACCIONES)[number];

export function esAccion(v: string): v is Accion {
  return (ACCIONES as readonly string[]).includes(v);
}

export type GrupoPermisos = { grupo: string; acciones: { accion: Accion; label: string; ayuda: string }[] };

/** Agrupado para la pantalla: el administrador piensa por tarea, no por slug. */
export const CATALOGO_PERMISOS: GrupoPermisos[] = [
  {
    grupo: "Ventas",
    acciones: [
      {
        accion: "venta.credito",
        label: "Vender a crédito",
        ayuda: "Sin esto solo puede cobrar de contado.",
      },
    ],
  },
  {
    grupo: "Reparto",
    acciones: [
      { accion: "reparto.abrir", label: "Abrir reparto", ayuda: "Iniciar la jornada de un camión." },
      {
        accion: "reparto.cerrar",
        label: "Cerrar reparto",
        ayuda: "Contar el camión, declarar la merma y finalizar la jornada.",
      },
      {
        accion: "reparto.cargar",
        label: "Registrar carga de proveedor",
        ayuda: "Subir mercadería al camión.",
      },
      {
        accion: "reparto.transferir",
        label: "Descargar en el salón",
        ayuda: "Mover mercadería del camión a un depósito.",
      },
      {
        accion: "reparto.objetivo",
        label: "Definir objetivo de carga",
        ayuda: "Cuánto debería llevar el camión de cada producto.",
      },
    ],
  },
  {
    grupo: "Configuración",
    acciones: [
      {
        accion: "camion.administrar",
        label: "Alta y baja de camiones",
        ayuda: "Agregar camiones o darlos de baja.",
      },
    ],
  },
  {
    grupo: "Caja",
    acciones: [
      {
        accion: "caja.abrir",
        label: "Abrir caja a mano",
        ayuda: "El reparto ya la abre solo; esto es para la caja del salón.",
      },
      {
        accion: "caja.cerrar",
        label: "Cerrar caja a mano",
        ayuda: "El cierre de reparto ya la cierra; esto es para la caja del salón.",
      },
    ],
  },
];

/**
 * Qué puede hacer cada rol cuando nadie configuró nada.
 *
 * Son los roles del documento (pág. 10). El vendedor móvil hace su ruta
 * completa pero no configura: dar de alta camiones u objetivos de carga es
 * decisión de la empresa, no del que maneja.
 */
const POR_ROL: Record<string, Accion[]> = {
  vendedor_movil: [
    "venta.credito",
    "reparto.abrir",
    "reparto.cerrar",
    "reparto.cargar",
    "reparto.transferir",
  ],
  supervisor: [
    "venta.credito",
    "reparto.abrir",
    "reparto.cerrar",
    "reparto.cargar",
    "reparto.transferir",
    "reparto.objetivo",
    "caja.abrir",
    "caja.cerrar",
  ],
  usuario: ["venta.credito", "caja.abrir", "caja.cerrar"],
};

function esAdmin(rol: string): boolean {
  return rol === "admin" || rol === "administrador" || rol === "super_admin";
}

/** Lo que el rol permite por defecto, sin mirar excepciones. */
export function permisosDeRol(rol: string | null | undefined): Set<Accion> {
  const r = normalizeErpRolSlug(rol);
  if (esAdmin(r)) return new Set(ACCIONES);

  const clave = r === "vendedor movil" || r === "vendedor móvil" ? "vendedor_movil" : r;
  return new Set(POR_ROL[clave] ?? POR_ROL.usuario);
}

/**
 * Permisos efectivos: el default del rol, con las excepciones encima.
 *
 * El administrador no se puede quedar afuera por una excepción mal guardada:
 * sería la forma más rápida de dejar una empresa sin quien la configure.
 */
export function resolverPermisos(
  rol: string | null | undefined,
  excepciones: { accion: string; permitido: boolean }[]
): Set<Accion> {
  const base = permisosDeRol(rol);
  if (esAdmin(normalizeErpRolSlug(rol))) return base;

  for (const e of excepciones) {
    if (!esAccion(e.accion)) continue;
    if (e.permitido) base.add(e.accion);
    else base.delete(e.accion);
  }
  return base;
}
