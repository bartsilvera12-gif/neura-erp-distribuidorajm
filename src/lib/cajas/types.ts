export interface CajaAbierta {
  id: string;
  numero_caja: number;
  estado: "abierta" | "cerrada";
  fecha_apertura: string;
  monto_apertura: number;
}
