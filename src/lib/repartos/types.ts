export interface ItemReparto {
  producto_id: string;
  nombre: string;
  unidad: string;
  cargado: number;
  vendido: number;
  devuelto: number;
  /** cargado − vendido + devuelto: lo que debería volver en el camión. */
  esperado: number;
  /** `null` mientras no se contó. */
  retornado: number | null;
  /** retornado − esperado. 0 = cuadra. `null` si no se contó. */
  diferencia: number | null;
}

export interface Reparto {
  id: string;
  camion: string;
  responsable: string | null;
  estado: "abierto" | "cerrado";
  fecha: string;
  abierto_at: string;
  cerrado_at: string | null;
  items: ItemReparto[];
  resumen: { productos: number; sin_contar: number; con_diferencia: number };
}
