/**
 * RUC paraguayo: separar número y dígito verificador, y calcular el DV.
 *
 * Sin dependencias de servidor, para poder usarlo también en la pantalla (por
 * ejemplo, para mostrar el DV calculado antes de consultar).
 */

/**
 * Dígito verificador del RUC: módulo 11 con base máxima 11, el algoritmo que
 * publica la DNIT (`pa_calcular_dv_11_A`). Los pesos van de 2 a 11 de derecha a
 * izquierda y vuelven a 2; si el resto es 0 o 1, el DV es 0.
 */
export function calcularDvRuc(numero: string): number {
  const limpio = numero.replace(/\D/g, "");
  let total = 0;
  let k = 2;
  for (let i = limpio.length - 1; i >= 0; i--) {
    if (k > 11) k = 2;
    total += Number(limpio[i]) * k;
    k++;
  }
  const resto = total % 11;
  return resto > 1 ? 11 - resto : 0;
}

export type RucSeparado = {
  ruc: string;
  dv: string;
  /** `true` si el DV no vino escrito y se calculó. */
  dvCalculado: boolean;
};

/**
 * Acepta como lo escribe la gente: "80012345-6", "80012345 6", "80.012.345-6"
 * o solo "80012345". Sin DV, lo calcula. `null` si no hay un número usable.
 */
export function separarRuc(entrada: string): RucSeparado | null {
  const t = (entrada ?? "").trim();
  if (!t) return null;
  const m = t.match(/^([\d.\s]+?)\s*[-\s]\s*(\d)$/);
  if (m) {
    const ruc = m[1].replace(/\D/g, "");
    if (ruc.length < 3 || ruc.length > 10) return null;
    return { ruc, dv: m[2], dvCalculado: false };
  }
  const ruc = t.replace(/\D/g, "");
  if (ruc.length < 3 || ruc.length > 10) return null;
  return { ruc, dv: String(calcularDvRuc(ruc)), dvCalculado: true };
}
