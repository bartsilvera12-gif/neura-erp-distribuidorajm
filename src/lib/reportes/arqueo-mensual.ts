import { semanaDelMes } from "@/lib/reportes/compras-semanal";

/**
 * Cuentas del arqueo del mes (compartido entre servidor y pantalla).
 *
 * Por cada caja (una persona, un día):
 *  - Crédito y contado = contado + crédito (lo vendido).
 *  - Debe rendir = apertura + contado + cobranzas + otros ingresos − gastos.
 *  - Rendición = efectivo contado + cheques + transferencias.
 *  - Diferencia = rendición − debe rendir (negativo: falta plata).
 * Sin efectivo contado (caja sin cerrar o cerrada sola a las 23:00 sin
 * conteo) no hay rendición ni diferencia: se muestra como pendiente.
 */

export type DiaArqueo = {
  caja_id: string;
  numero_caja: number;
  usuario_id: string | null;
  usuario: string | null;
  fecha: string;
  apertura: number;
  contado: number;
  cobranzas: number;
  otros: number;
  cheque: number;
  transferencia: number;
  gastos: number;
  credito: number;
  efectivo: number | null;
  cerrada: boolean;
};

export type FilaArqueo = DiaArqueo & {
  vendido: number;
  debe: number;
  rendicion: number | null;
  diferencia: number | null;
};

export type Totales = {
  contado: number;
  cobranzas: number;
  otros: number;
  credito: number;
  cheque: number;
  transferencia: number;
  gastos: number;
  vendido: number;
  debe: number;
  efectivo: number;
  rendicion: number;
  diferencia: number;
  /** Días sin conteo: la diferencia no los incluye. */
  sin_contar: number;
};

export type SemanaArqueo = { n: number; desde: string; hasta: string; filas: FilaArqueo[]; totales: Totales };

export type PersonaArqueo = {
  clave: string;
  nombre: string;
  semanas: SemanaArqueo[];
  totales: Totales;
};

export type ArqueoMensual = {
  mes: string;
  personas: PersonaArqueo[];
  totales: Totales;
};

export function filaDe(d: DiaArqueo): FilaArqueo {
  const vendido = d.contado + d.credito;
  const debe = d.apertura + d.contado + d.cobranzas + d.otros - d.gastos;
  const rendicion = d.efectivo === null ? null : d.efectivo + d.cheque + d.transferencia;
  return { ...d, vendido, debe, rendicion, diferencia: rendicion === null ? null : rendicion - debe };
}

export function sumar(filas: FilaArqueo[]): Totales {
  const t: Totales = {
    contado: 0, cobranzas: 0, otros: 0, credito: 0, cheque: 0, transferencia: 0, gastos: 0,
    vendido: 0, debe: 0, efectivo: 0, rendicion: 0, diferencia: 0, sin_contar: 0,
  };
  for (const f of filas) {
    t.contado += f.contado;
    t.cobranzas += f.cobranzas;
    t.otros += f.otros;
    t.credito += f.credito;
    t.cheque += f.cheque;
    t.transferencia += f.transferencia;
    t.gastos += f.gastos;
    t.vendido += f.vendido;
    t.debe += f.debe;
    if (f.efectivo === null) t.sin_contar += 1;
    else {
      t.efectivo += f.efectivo;
      t.rendicion += f.rendicion ?? 0;
      t.diferencia += f.diferencia ?? 0;
    }
  }
  return t;
}

export function armarArqueoMensual(mes: string, dias: DiaArqueo[]): ArqueoMensual {
  const porPersona = new Map<string, { nombre: string; filas: FilaArqueo[] }>();
  for (const d of dias) {
    const clave = d.usuario_id ?? "sin-usuario";
    const p = porPersona.get(clave) ?? {
      nombre: d.usuario ?? (d.usuario_id ? `Usuario ${d.usuario_id.slice(0, 8)}` : "Sin usuario"),
      filas: [],
    };
    p.filas.push(filaDe(d));
    porPersona.set(clave, p);
  }
  const personas: PersonaArqueo[] = [...porPersona.entries()]
    .map(([clave, p]) => {
      const porSemana = new Map<number, FilaArqueo[]>();
      for (const f of p.filas) {
        const n = semanaDelMes(f.fecha);
        porSemana.set(n, [...(porSemana.get(n) ?? []), f]);
      }
      const semanas = [...porSemana.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([n, filas]) => ({
          n,
          desde: filas[0].fecha,
          hasta: filas[filas.length - 1].fecha,
          filas,
          totales: sumar(filas),
        }));
      return { clave, nombre: p.nombre, semanas, totales: sumar(p.filas) };
    })
    // El que más vendió primero (como en la planilla, los camioneros arriba).
    .sort((a, b) => b.totales.vendido - a.totales.vendido);
  return { mes, personas, totales: sumar(personas.flatMap((p) => p.semanas.flatMap((s) => s.filas))) };
}
