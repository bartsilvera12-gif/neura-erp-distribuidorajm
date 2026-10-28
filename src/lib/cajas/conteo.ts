/**
 * Conteo del efectivo al cerrar la caja, como la planilla del arqueo:
 * cuántos hay de cada billete y moneda (el monto sale solo), más el sencillo
 * (cambio del cajero) y las monedas sueltas por monto. Total = lo contado.
 */

/**
 * Billetes y monedas de guaraníes, de mayor a menor. Sin el billete de 100.000
 * ni la moneda de 50: no se usan en esta caja, así que no se cuentan.
 */
export const DENOMINACIONES = [50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500, 100] as const;

export type ConteoEfectivo = {
  /** Cantidad por denominación: { "50000": 12, … }. */
  billetes: Record<string, number>;
  /** Sencillo / cambio del cajero (monto). */
  sencillo: number;
  /** Monedas sueltas, por monto. */
  monedas: number;
};

export function subtotalBilletes(c: ConteoEfectivo): number {
  return DENOMINACIONES.reduce((s, d) => s + d * (Number(c.billetes[String(d)]) || 0), 0);
}

export function totalConteo(c: ConteoEfectivo): number {
  return subtotalBilletes(c) + (Number(c.sencillo) || 0) + (Number(c.monedas) || 0);
}

/** Valida y limpia lo que llega del navegador; `null` si no es un conteo. */
export function limpiarConteo(raw: unknown): ConteoEfectivo | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const b = (o.billetes ?? {}) as Record<string, unknown>;
  const entero = (v: unknown) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const billetes: Record<string, number> = {};
  for (const d of DENOMINACIONES) {
    const n = entero(b[String(d)]);
    if (n > 0) billetes[String(d)] = n;
  }
  return { billetes, sencillo: entero(o.sencillo), monedas: entero(o.monedas) };
}
