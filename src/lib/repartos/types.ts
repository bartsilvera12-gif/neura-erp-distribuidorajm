/**
 * Tipos del control de mercadería.
 *
 * El camión es una ubicación de inventario (`camiones.ubicacion_id`), así que
 * lo que "debería estar arriba del camión" no se calcula: es el saldo de esa
 * ubicación en `inventario_stock_ubicacion`. Eso es lo que el documento de
 * relevamiento llama stock teórico, y sale bien sin importar cuántas cargas,
 * transferencias o ventas hubo en el medio.
 *
 * `reparto_stock` guarda la foto de la jornada: con cuánto salió, cuánto se
 * vendió, cuánto rechazó el cliente y cuánto se contó al volver.
 */

export interface ItemReparto {
  producto_id: string;
  nombre: string;
  unidad: string;
  /** `cantidad_inicial`: el saldo del camión cuando se abrió el reparto. */
  cargado: number;
  vendido: number;
  /** Lo que el cliente rechazó y volvió en el camión. */
  devuelto: number;
  /** Saldo actual de la ubicación del camión: lo que debería estar arriba. */
  teorico: number;
  /** Conteo físico del cierre. `null` mientras no se contó. */
  contado: number | null;
  /** contado − teórico. `null` si no se contó. */
  diferencia: number | null;
  motivo: string | null;
}

export interface Reparto {
  id: string;
  camion_id: string;
  /** `camiones.alias`. */
  camion: string;
  ubicacion_id: string | null;
  repartidor_id: string;
  repartidor: string | null;
  estado: "abierto" | "cerrado";
  fecha: string;
  abierto_at: string;
  cerrado_at: string | null;
  merma_kg: number | null;
  notas_cierre: string | null;
  items: ItemReparto[];
}

export interface Camion {
  id: string;
  alias: string;
  patente: string | null;
  activo: boolean;
  ubicacion_id: string | null;
}

/** Una ubicación de inventario: salón, depósito o camión. */
export interface Ubicacion {
  id: string;
  nombre: string;
  tipo: string;
}

/** Objetivo de carga de un producto en un camión, con su sugerencia. */
export interface ObjetivoCamion {
  producto_id: string;
  nombre: string;
  unidad: string;
  /** `null` = ese producto no se sugiere para este camión. */
  objetivo: number | null;
  /** Remanente actual en el camión. */
  actual: number;
  /** objetivo − actual, nunca negativo. */
  sugerido: number;
}
