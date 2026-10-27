import type { ConteoEfectivo } from "./conteo";

/** Un renglón de la planilla: a quién o qué, el N° de factura y el importe. */
export interface RenglonPlanilla {
  nombre: string;
  factura: string | null;
  monto: number;
  medio?: string;
}

/**
 * Planilla de arqueo de una caja, como la de papel de los camioneros:
 * contado, composición de caja, crédito del día, cobranzas, gastos y
 * transferencias, con la cuenta final de lo que tiene que rendir.
 */
export interface PlanillaArqueo {
  caja: {
    id: string;
    numero_caja: number;
    estado: "abierta" | "cerrada";
    fecha_apertura: string;
    fecha_cierre: string | null;
    monto_apertura: number;
    sencillo: number;
  };
  responsable: string | null;
  camion: string | null;
  conteo: ConteoEfectivo | null;
  /** Lo cobrado en la caja por ventas de contado (todos los medios). */
  contado: number;
  credito: RenglonPlanilla[];
  cobranzas: RenglonPlanilla[];
  /** Ingresos cargados a mano (no vienen de una venta). */
  otros_ingresos: RenglonPlanilla[];
  /** Egresos, retiros y ajustes con su concepto. */
  gastos: RenglonPlanilla[];
  /** Todo lo que entró por transferencia (ventas, cobranzas y otros). */
  transferencias: RenglonPlanilla[];
  cheques: number;
  /** Tarjeta u otros medios que no son efectivo, transferencia ni cheque. */
  otros_medios: number;
  /** Lo vendido en esta caja por categoría de producto (mayor primero). */
  por_categoria: { categoria: string; total: number }[];
  cuentas: { banco: string; cuenta: string | null; alias: string | null; titular: string | null; documento: string | null }[];
}

/** Lo que el camionero completa (y se guarda tal cual). */
export interface DatosPlanilla {
  /** Con cuánto arrancó la caja (apertura + sencillo): también se rinde. */
  apertura: number;
  contado: number;
  conteo: ConteoEfectivo;
  cheques: number;
  credito: RenglonPlanilla[];
  cobranzas: RenglonPlanilla[];
  gastos: RenglonPlanilla[];
  transferencias: RenglonPlanilla[];
  observaciones: string;
}

export type EstadoPlanilla = "borrador" | "enviada" | "revisada";

export interface PlanillaGuardada {
  id: string;
  caja_id: string;
  fecha: string;
  responsable: string | null;
  camion: string | null;
  numero_caja: number | null;
  estado: EstadoPlanilla;
  datos: DatosPlanilla;
  enviada_at: string | null;
  revisada_at: string | null;
  revisada_por: string | null;
  updated_at: string;
}

/** Una fila de la lista del administrador. */
export interface PlanillaResumen {
  id: string;
  caja_id: string;
  fecha: string;
  responsable: string | null;
  camion: string | null;
  numero_caja: number | null;
  estado: EstadoPlanilla;
  total_ventas: number;
  total_contado: number;
  total_credito: number;
  total_cobranzas: number;
  total_gastos: number;
  total_transferencias: number;
  efectivo: number;
  diferencia: number;
  enviada_at: string | null;
  updated_at: string;
}

const sumar = (l: RenglonPlanilla[]) => l.reduce((s, r) => s + (Number(r.monto) || 0), 0);

/**
 * Las cuentas de la planilla, como en el papel:
 *  - Total de ventas = contado + crédito.
 *  - Debe rendir = apertura + contado + cobranzas (lo que hubo en la caja).
 *  - Rinde = efectivo contado + cheques + gastos y vales + transferencias.
 *  - Diferencia = rinde − debe (negativo: falta plata).
 */
export function totalesPlanilla(d: DatosPlanilla, efectivo: number) {
  const credito = sumar(d.credito);
  const cobranzas = sumar(d.cobranzas);
  const gastos = sumar(d.gastos);
  const transferencias = sumar(d.transferencias);
  const debe = (Number(d.apertura) || 0) + d.contado + cobranzas;
  const rinde = efectivo + (Number(d.cheques) || 0) + gastos + transferencias;
  return {
    ventas: d.contado + credito,
    credito,
    cobranzas,
    gastos,
    transferencias,
    debe,
    rinde,
    diferencia: rinde - debe,
  };
}
