/**
 * Tipos del control de mercadería, sobre las tablas que el schema ya tenía:
 * `repartos`, `camiones`, `reparto_stock`.
 *
 * Por producto:
 *   esperado = cantidad_inicial − vendido + cantidad_devuelta
 *
 * `cantidad_devuelta` es lo que el cliente rechaza: vuelve en el camión, así
 * que suma a lo que debería volver al depósito.
 */

export interface ItemReparto {
  producto_id: string;
  nombre: string;
  unidad: string;
  /** `reparto_stock.cantidad_inicial`: lo que salió en el camión. */
  cargado: number;
  vendido: number;
  /** `reparto_stock.cantidad_devuelta`: lo que el cliente rechazó. */
  devuelto: number;
  /** cargado − vendido + devuelto: lo que debería volver en el camión. */
  esperado: number;
}

export interface Reparto {
  id: string;
  camion_id: string;
  /** `camiones.alias`. */
  camion: string;
  repartidor_id: string;
  /** Nombre del repartidor, o su email si no tiene nombre cargado. */
  repartidor: string | null;
  estado: "abierto" | "cerrado";
  fecha: string;
  abierto_at: string;
  cerrado_at: string | null;
  /** Merma total declarada al cerrar. `null` mientras está abierto. */
  merma_kg: number | null;
  notas_cierre: string | null;
  items: ItemReparto[];
}

export interface Camion {
  id: string;
  alias: string;
  patente: string | null;
  activo: boolean;
}
