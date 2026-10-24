"use client";

import {
  DENOMINACIONES,
  subtotalBilletes,
  totalConteo,
  type ConteoEfectivo,
} from "@/lib/cajas/conteo";

const gs = (n: number) => `${Math.round(n).toLocaleString("es-PY")} ₲`;
const soloDigitos = (v: string) => v.replace(/\D/g, "");
const conMiles = (v: string) => (v ? Number(v).toLocaleString("es-PY") : "");

/**
 * Planilla de arqueo: Billete | Cant | Monto, el subtotal «Caja», el sencillo
 * y las monedas sueltas, y el Total. Editable al cerrar; con `soloLectura` se
 * muestra (e imprime) tal como quedó.
 */
export default function ConteoEfectivoTabla({
  conteo,
  onChange,
  soloLectura = false,
}: {
  conteo: ConteoEfectivo;
  onChange?: (c: ConteoEfectivo) => void;
  soloLectura?: boolean;
}) {
  const caja = subtotalBilletes(conteo);
  const total = totalConteo(conteo);
  const cambiar = (patch: Partial<ConteoEfectivo>) => onChange?.({ ...conteo, ...patch });
  const filas = soloLectura
    ? DENOMINACIONES.filter((d) => (conteo.billetes[String(d)] ?? 0) > 0)
    : DENOMINACIONES;

  const celdaInput =
    "h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-[#4FAEB2]";

  return (
    <div className="overflow-hidden rounded-xl border border-slate-300">
      <div className="bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-slate-800">Arqueo de caja</div>
      <table className="w-full text-sm">
        <thead className="bg-emerald-50/60 text-left text-xs font-semibold text-slate-600">
          <tr>
            <th className="border-t border-slate-200 px-3 py-1.5">Billetes</th>
            <th className="w-24 border-t border-slate-200 px-2 py-1.5 text-center">Cant</th>
            <th className="border-t border-slate-200 px-3 py-1.5 text-right">Monto</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((d) => {
            const cant = conteo.billetes[String(d)] ?? 0;
            return (
              <tr key={d} className="border-t border-slate-200">
                <td className="px-3 py-1 text-right tabular-nums text-slate-700">{gs(d)}</td>
                <td className="px-2 py-1 text-center">
                  {soloLectura ? (
                    <span className="tabular-nums">{cant}</span>
                  ) : (
                    <input
                      inputMode="numeric"
                      value={cant ? String(cant) : ""}
                      onChange={(e) => {
                        const n = Number(soloDigitos(e.target.value) || "0");
                        cambiar({ billetes: { ...conteo.billetes, [String(d)]: n } });
                      }}
                      placeholder="0"
                      aria-label={`Cantidad de ${gs(d)}`}
                      className={celdaInput}
                    />
                  )}
                </td>
                <td className="bg-emerald-50/40 px-3 py-1 text-right font-medium tabular-nums text-slate-800">
                  {cant ? gs(cant * d) : "—"}
                </td>
              </tr>
            );
          })}
          <tr className="border-t border-slate-300">
            <td className="px-3 py-1.5 font-medium text-slate-700" colSpan={2}>
              Caja
            </td>
            <td className="bg-emerald-50/40 px-3 py-1.5 text-right font-semibold tabular-nums">{gs(caja)}</td>
          </tr>
          {(["sencillo", "monedas"] as const).map((k) =>
            soloLectura && !conteo[k] ? null : (
              <tr key={k} className="border-t border-slate-200">
                <td className="px-3 py-1.5 text-slate-700">{k === "sencillo" ? "Sencillo" : "Monedas"}</td>
                <td className="px-2 py-1" colSpan={soloLectura ? 1 : 2}>
                  {soloLectura ? null : (
                    <input
                      inputMode="numeric"
                      value={conMiles(conteo[k] ? String(conteo[k]) : "")}
                      onChange={(e) => cambiar({ [k]: Number(soloDigitos(e.target.value) || "0") })}
                      placeholder="0"
                      aria-label={k === "sencillo" ? "Sencillo" : "Monedas"}
                      className={celdaInput}
                    />
                  )}
                </td>
                {soloLectura ? (
                  <td className="bg-emerald-50/40 px-3 py-1.5 text-right font-medium tabular-nums">{gs(conteo[k])}</td>
                ) : null}
              </tr>
            )
          )}
          <tr className="border-t-2 border-slate-400 bg-lime-400/70">
            <td className="px-3 py-2 font-bold text-slate-900" colSpan={2}>
              Total
            </td>
            <td className="px-3 py-2 text-right text-base font-bold tabular-nums text-slate-900">{gs(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
