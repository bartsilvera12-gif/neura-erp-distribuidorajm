/**
 * Armado por semanas, compartido entre el servidor y la pantalla (Excel).
 *
 * Semanas de lunes a domingo, como la planilla de la distribuidora: la
 * «1ERA SEMANA» es la que contiene el día 1 del mes (solo los días del mes).
 */

export type CompraDia = { id: string; fecha: string; numero: string | null; proveedor: string | null; total: number };

export type DiaSemana = { fecha: string; compras: CompraDia[]; total: number };

export type Semana = {
  n: number;
  desde: string;
  hasta: string;
  /** Lunes a sábado siempre; el domingo solo si tuvo compras. */
  dias: DiaSemana[];
  total: number;
  /** Total del mes hasta esta semana inclusive. */
  acumulado: number;
};

export type ComprasSemanal = {
  mes: string;
  semanas: Semana[];
  total_mes: number;
  cantidad: number;
  /** Los últimos 12 meses (para el gráfico), terminando en `mes`. */
  meses: { mes: string; total: number }[];
};

/**
 * Número de semana del mes, de lunes a domingo: la 1 es la del día 1. Si el
 * mes empieza en domingo, ese domingo va con la semana siguiente (como en la
 * planilla: «1ERA SEMANA» arranca el lunes 2).
 */
export function semanaDelMes(fecha: string): number {
  const d = new Date(`${fecha}T12:00:00Z`);
  const dia = d.getUTCDate();
  const primero = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12));
  if (primero.getUTCDay() === 0) return dia === 1 ? 1 : Math.floor((dia - 2) / 7) + 1;
  const desdeLunes = (primero.getUTCDay() + 6) % 7;
  return Math.floor((dia - 1 + desdeLunes) / 7) + 1;
}

export function armarSemanas(mes: string, compras: CompraDia[], meses: { mes: string; total: number }[]): ComprasSemanal {
  const [anio, m] = mes.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(anio, m, 0)).getUTCDate();
  const porDia = new Map<string, CompraDia[]>();
  for (const c of compras) porDia.set(c.fecha, [...(porDia.get(c.fecha) ?? []), c]);

  const porSemana = new Map<number, DiaSemana[]>();
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const f = `${mes}-${String(dia).padStart(2, "0")}`;
    const cs = porDia.get(f) ?? [];
    // Domingo: solo si se compró algo.
    if (new Date(`${f}T12:00:00Z`).getUTCDay() === 0 && cs.length === 0) continue;
    const n = semanaDelMes(f);
    porSemana.set(n, [...(porSemana.get(n) ?? []), { fecha: f, compras: cs, total: cs.reduce((s, c) => s + c.total, 0) }]);
  }
  const semanas: Semana[] = [];
  let acumulado = 0;
  for (const [n, dias] of [...porSemana.entries()].sort((x, y) => x[0] - y[0])) {
    const total = dias.reduce((s, d) => s + d.total, 0);
    acumulado += total;
    semanas.push({ n, desde: dias[0].fecha, hasta: dias[dias.length - 1].fecha, dias, total, acumulado });
  }
  return { mes, semanas, total_mes: acumulado, cantidad: compras.length, meses };
}

const ORDINAL = ["1ERA", "2DA", "3ERA", "4TA", "5TA", "6TA"];
export const nombreSemana = (n: number) => `${ORDINAL[n - 1] ?? `${n}A`} SEMANA`;

const DIAS = ["DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"];
/** «LUN 02-11», como encabezan los días en la planilla. */
export function encabezadoDia(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${fecha.slice(8, 10)}-${fecha.slice(5, 7)}`;
}

/** «001-001-0052839» → «52839»: así se anota en la planilla. */
export function numeroCorto(n: string | null): string {
  if (!n) return "—";
  const ult = n.split("-").pop() ?? n;
  return /^\d+$/.test(ult) ? String(Number(ult)) : n;
}

export const NOMBRE_MES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
export const nombreMes = (mes: string) => `${NOMBRE_MES[Number(mes.slice(5, 7)) - 1] ?? mes} ${mes.slice(0, 4)}`;
