export type MetodoValuacion = "CPP" | "FIFO" | "LIFO";
export type TipoMovimiento = "ENTRADA" | "SALIDA" | "AJUSTE";
export type OrigenMovimiento = "compra" | "venta" | "ajuste_manual" | "inventario_inicial";

export interface Producto {
  id: string;
  nombre: string;
  sku: string;
  costo_promedio: number;
  precio_venta: number;
  stock_actual: number;
  stock_minimo: number;
  unidad_medida: string;
  metodo_valuacion: MetodoValuacion;
  codigo_barras?: string | null;
  codigo_barras_interno?: boolean;
  imagen_path?: string | null;
  imagen_url?: string | null;
  categoria_principal_id?: string | null;
  ubicacion_principal_id?: string | null;
  proveedor_principal_id?: string | null;
  /** IVA con el que se vende: "5%" (pollo), "10%", "EXENTA". `null` = sin definir. */
  tipo_iva?: string | null;
  /** Cajas o paquetes con los que también se vende y se compra (SQL 57). */
  empaques?: Empaque[];
  /**
   * Solo en el catálogo de la caja: esta fila es la caja de otro producto.
   * `id` es `emp:<id de la caja>`; la venta descuenta `factor` unidades de
   * `producto_id`.
   */
  empaque?: { id: string; producto_id: string; factor: number; nombre: string } | null;
}

/** Una caja o paquete de un producto: «Caja x12» trae 12 unidades. */
export interface Empaque {
  id: string;
  producto_id: string;
  nombre: string;
  /** Unidades que trae. */
  factor: number;
  /** Precio de la caja. `null`: unidades × precio de la unidad. */
  precio_venta: number | null;
  codigo_barras: string | null;
}

export interface MovimientoInventario {
  id: string;
  producto_id: string;
  producto_nombre: string;
  producto_sku: string;
  tipo: TipoMovimiento;
  cantidad: number;
  costo_unitario: number;
  origen: OrigenMovimiento;
  fecha: string;       // ISO string
  referencia?: string; // ej: "COMP-000001"
  created_by?: string | null;
  usuario_nombre?: string | null;
}
