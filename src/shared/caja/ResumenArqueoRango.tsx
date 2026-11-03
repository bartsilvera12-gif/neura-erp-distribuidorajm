"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { getArqueo, type Arqueo, type IngresoPorMedio } from "@/lib/cajas/arqueo";
import { fechaLarga } from "@/shared/caja/arqueo-ui";

/**
 * Resumen de arqueo para un rango de fechas. Pedido explícito de la clienta
 * (soporte, punto 6c): poder ver los movimientos y totales del período,
 * diferenciados por método de pago.
 *
 * Estrategia: se consulta `/api/cajas/arqueo` por cada día del rango (en
 * paralelo, con `alcance=todas` para no esconder cajas de otros usuarios).
 * El servidor no se cambia; solo se agrega acá la agregación. El rango se
 * limita a `MAX_DIAS` para no quemar el navegador ni el pool de PG con un
 * pedido descuidado "desde 2020".
 */

const MAX_DIAS = 60;
const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString("es-PY")}`;

/** Lista de YYYY-MM-DD desde `desde` hasta `hasta`, inclusive. */
function diasDelRango(desde: string, hasta: string): string[] {
  if (!desde || !hasta || desde > hasta) return [];
  const partes = (s: string) => {
    const [a, m, d] = s.split("-").map(Number);
    return Date.UTC(a, m - 1, d);
  };
  const dias: string[] = [];
  for (let t = partes(desde); t <= partes(hasta); t += 86_400_000) {
    const d = new Date(t);
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    dias.push(iso);
    if (dias.length > MAX_DIAS) break;
  }
  return dias;
}

interface ResumenDia {
  fecha: string;
  arqueo: Arqueo | null;
  error?: string;
}

export default function ResumenArqueoRango({ desde, hasta }: { desde: string; hasta: string }) {
  const dias = useMemo(() => diasDelRango(desde, hasta), [desde, hasta]);
  const [resultados, setResultados] = useState<ResumenDia[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setResultados([]);
    (async () => {
      // En paralelo: cada día es una consulta corta al endpoint existente.
      // Si uno falla, el resumen muestra los otros y marca el día en error.
      const partes = await Promise.all(
        dias.map(async (f): Promise<ResumenDia> => {
          try {
            const a = await getArqueo(f, true);
            return { fecha: f, arqueo: a };
          } catch (e) {
            return { fecha: f, arqueo: null, error: e instanceof Error ? e.message : String(e) };
          }
        })
      );
      if (!cancelado) {
        setResultados(partes);
        setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [dias]);

  const excedido = (desde && hasta && desde <= hasta) ? diasDelRango(desde, hasta).length >= MAX_DIAS : false;

  // Totales del período, agrupados por medio de pago.
  const totalesPorMedio = useMemo(() => {
    const acum = new Map<string, { label: string; cantidad: number; total: number }>();
    for (const r of resultados) {
      for (const c of r.arqueo?.cajas ?? []) {
        for (const m of c.ingresos.por_medio) {
          const prev = acum.get(m.medio) ?? { label: m.label, cantidad: 0, total: 0 };
          prev.cantidad += m.cantidad;
          prev.total += m.total;
          acum.set(m.medio, prev);
        }
      }
    }
    return [...acum.values()].sort((a, b) => b.total - a.total);
  }, [resultados]);

  const totalIngresos = totalesPorMedio.reduce((s, m) => s + m.total, 0);
  const totalCredito = resultados.reduce(
    (s, r) => s + (r.arqueo?.credito?.total ?? 0),
    0
  );
  const diasConCajas = resultados.filter((r) => (r.arqueo?.cajas.length ?? 0) > 0).length;

  if (cargando) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando resumen del {fechaLarga(desde)} al {fechaLarga(hasta)}…
      </p>
    );
  }

  if (dias.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-500">
        Rango de fechas inválido.
      </p>
    );
  }

  if (diasConCajas === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-500">
        No hubo cajas en el período <strong>{fechaLarga(desde)}</strong> – <strong>{fechaLarga(hasta)}</strong>.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {excedido ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          El rango excede {MAX_DIAS} días: se muestran los primeros {MAX_DIAS} días desde el inicio.
        </p>
      ) : null}

      {/* Totales del período */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          Resumen del {fechaLarga(desde)} al {fechaLarga(hasta)}
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          {diasConCajas} día{diasConCajas === 1 ? "" : "s"} con cajas · {dias.length} día{dias.length === 1 ? "" : "s"} consultado{dias.length === 1 ? "" : "s"}
        </p>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {totalesPorMedio.length === 0 ? (
            <p className="col-span-full text-sm text-slate-400">Sin ingresos en el período.</p>
          ) : (
            totalesPorMedio.map((m) => (
              <div key={m.label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {m.label}
                </dt>
                <dd className="mt-1 text-base font-semibold tabular-nums text-slate-900">
                  {gs(m.total)}
                </dd>
                <dd className="text-[11px] text-slate-400">{m.cantidad} mov.</dd>
              </div>
            ))
          )}
        </dl>

        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-100 pt-3">
          <span className="text-sm text-slate-600">Total ingresos del período</span>
          <span className="text-xl font-bold tabular-nums text-slate-900">{gs(totalIngresos)}</span>
        </div>
        {totalCredito > 0 ? (
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2 text-xs text-slate-500">
            <span>Ventas a crédito del período (no entraron en caja)</span>
            <span className="font-semibold tabular-nums">{gs(totalCredito)}</span>
          </div>
        ) : null}
      </section>

      {/* Desglose día por día */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h3 className="border-b border-slate-100 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Detalle por día
        </h3>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-5 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium text-right">Cajas</th>
              <th className="px-3 py-2 font-medium text-right">Efectivo</th>
              <th className="px-3 py-2 font-medium text-right">Transfer.</th>
              <th className="px-3 py-2 font-medium text-right">Cheque</th>
              <th className="px-3 py-2 font-medium text-right">Otros</th>
              <th className="px-5 py-2 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {resultados.map((r) => {
              const porMedio = resumenDiaPorMedio(r.arqueo?.cajas.flatMap((c) => c.ingresos.por_medio) ?? []);
              const cantidadCajas = r.arqueo?.cajas.length ?? 0;
              const totalDia = (r.arqueo?.cajas ?? []).reduce(
                (s, c) => s + c.ingresos.total,
                0
              );
              return (
                <tr key={r.fecha} className="border-t border-slate-100">
                  <td className="px-5 py-2 text-slate-700 tabular-nums">{r.fecha}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {cantidadCajas || "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{porMedio.efectivo > 0 ? gs(porMedio.efectivo) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{porMedio.transferencia > 0 ? gs(porMedio.transferencia) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{porMedio.cheque > 0 ? gs(porMedio.cheque) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{porMedio.otro > 0 ? gs(porMedio.otro) : "—"}</td>
                  <td className="px-5 py-2 text-right tabular-nums font-semibold text-slate-900">
                    {totalDia > 0 ? gs(totalDia) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/** Suma los montos de un listado de IngresoPorMedio por el medio normalizado. */
function resumenDiaPorMedio(filas: IngresoPorMedio[]): {
  efectivo: number;
  transferencia: number;
  cheque: number;
  otro: number;
} {
  const r = { efectivo: 0, transferencia: 0, cheque: 0, otro: 0 };
  for (const f of filas) {
    const m = (f.medio || "").toLowerCase();
    if (m === "efectivo") r.efectivo += f.total;
    else if (m === "transferencia") r.transferencia += f.total;
    else if (m === "cheque") r.cheque += f.total;
    else r.otro += f.total;
  }
  return r;
}
