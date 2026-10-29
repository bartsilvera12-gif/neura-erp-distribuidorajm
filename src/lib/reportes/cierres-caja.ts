/** Una caja en el reporte de cierres: lo que entró, lo que salió y si cuadró. */
export interface CierreCaja {
  caja_id: string;
  numero_caja: number;
  estado: "abierta" | "cerrada";
  fecha_apertura: string;
  fecha_cierre: string | null;
  responsable: string | null;
  apertura: number;
  /** Cobrado por ventas de contado, por medio. */
  efectivo: number;
  transferencia: number;
  cheque: number;
  otros_medios: number;
  contado: number;
  credito: number;
  total_ventas: number;
  cobranzas: number;
  otros_ingresos: number;
  egresos: number;
  /** Efectivo que tendría que haber en el cajón. */
  esperado: number;
  /** Lo contado al cerrar (null si sigue abierta). */
  contado_cierre: number | null;
  diferencia: number | null;
  planilla_estado: string | null;
  planilla_diferencia: number | null;
}
