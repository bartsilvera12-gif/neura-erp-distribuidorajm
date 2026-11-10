/**
 * Metas de ventas mensuales (en guaraníes): tipos y cuentas compartidas entre
 * el servidor y la pantalla.
 *
 * Una meta es de un mes y de un ámbito: «total» (toda la empresa) o una
 * persona (lo que vendió en sus cajas: un camionero, el salón). Lo vendido es
 * crédito + contado, sin anuladas, igual que en el resto de los reportes.
 */

export type Ambito = { clave: string; nombre: string };

export type MetaVentas = {
  id: string;
  mes: string;
  clave: string;
  nombre: string;
  monto: number;
  nota: string | null;
  vendido: number;
  /** Lo vendido por día del mes (YYYY-MM-DD → monto), para el gráfico. */
  por_dia: Record<string, number>;
};

export type ResumenMes = { mes: string; meta: number; vendido: number };

export type MetasDelMes = {
  disponible: boolean;
  mes: string;
  hoy: string;
  metas: MetaVentas[];
  /** Personas y «Total empresa», para elegir al cargar una meta. */
  ambitos: Ambito[];
  /** Meses con metas cargadas (pasados y futuros), con la meta total y lo vendido. */
  meses: ResumenMes[];
  es_admin: boolean;
};

export const CLAVE_TOTAL = "total";

/** Días del mes, cuántos pasaron (contando hoy) y cuántos faltan. */
export function diasDelMes(mes: string, hoy: string) {
  const [a, m] = mes.split("-").map(Number);
  const total = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const mesHoy = hoy.slice(0, 7);
  const pasados = mes < mesHoy ? total : mes > mesHoy ? 0 : Number(hoy.slice(8, 10));
  return { total, pasados, restantes: total - pasados };
}

/**
 * Las cuentas que se muestran de una meta:
 *  - avance (%) = vendido / meta;
 *  - falta = meta − vendido (nunca negativo);
 *  - por día para llegar = lo que falta / días que quedan (sin contar hoy);
 *  - proyección = al ritmo que se viene vendiendo, cuánto se llega a fin de mes.
 */
export function cuentasMeta(meta: number, vendido: number, mes: string, hoy: string) {
  const d = diasDelMes(mes, hoy);
  const avance = meta > 0 ? (vendido / meta) * 100 : 0;
  const falta = Math.max(0, meta - vendido);
  const porDiaNecesario = d.restantes > 0 ? falta / d.restantes : falta;
  const proyeccion = d.pasados > 0 ? (vendido / d.pasados) * d.total : 0;
  // Lo esperado a hoy si se vendiera parejo todos los días.
  const esperadoHoy = (meta * d.pasados) / d.total;
  return { ...d, avance, falta, porDiaNecesario, proyeccion, esperadoHoy, alDia: vendido >= esperadoHoy };
}
