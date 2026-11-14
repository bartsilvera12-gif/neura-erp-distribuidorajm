"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer, X } from "lucide-react";
import MontoInput from "@/components/ui/MontoInput";
import { numeroALetras } from "@/lib/ventas/numero-letras";
import { fechaCorta, inputCls, nombrePeriodo, type Funcionario, type Pago } from "./api";

const miles = (n: number) => Math.round(n || 0).toLocaleString("es-PY");
const CLAVE_EMPRESA = "rrhh:recibo:empresa";
const CLAVE_PATRONAL = "rrhh:recibo:patronal";

/**
 * Recibo de salario imprimible (A4, se guarda como PDF desde el diálogo de
 * impresión). Parte del pago de RRHH: básico = importe del pago, IPS 9% si el
 * funcionario aporta. Otros haberes y descuentos se pueden completar antes de
 * imprimir; razón social y N° patronal se recuerdan en este navegador.
 */
export default function ReciboSalario({
  pago,
  funcionario,
  onCerrar,
}: {
  pago: Pago;
  funcionario: Funcionario | null;
  onCerrar: () => void;
}) {
  const [empresa, setEmpresa] = useState("DISTRIBUIDORA J.M. S.A.");
  const [patronal, setPatronal] = useState("75.092");
  const [otros, setOtros] = useState(0);
  const [descuentos, setDescuentos] = useState(0);

  useEffect(() => {
    try {
      setEmpresa(localStorage.getItem(CLAVE_EMPRESA) || "DISTRIBUIDORA J.M. S.A.");
      setPatronal(localStorage.getItem(CLAVE_PATRONAL) || "75.092");
    } catch {
      /* sin localStorage: se completa a mano */
    }
  }, []);
  function guardarDatos(e: string, p: string) {
    try {
      localStorage.setItem(CLAVE_EMPRESA, e);
      localStorage.setItem(CLAVE_PATRONAL, p);
    } catch {
      /* ignorar */
    }
  }

  const basico = pago.monto;
  const aportaIps = funcionario?.aporta_ips ?? false;
  const ips = useMemo(() => (aportaIps ? Math.round(basico * 0.09) : 0), [aportaIps, basico]);
  const neto = Math.max(0, basico + otros - descuentos - ips);
  const nombre = funcionario ? `${funcionario.nombre} ${funcionario.apellido ?? ""}`.trim() : pago.funcionario_nombre;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div className="no-imprimir flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-base font-bold text-slate-900">Recibo de salario</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#3f9599]"
            >
              <Printer className="h-4 w-4" />
              Imprimir / guardar PDF
            </button>
            <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="no-imprimir grid grid-cols-2 gap-3 border-b border-slate-100 p-4">
          <label className="text-xs font-semibold text-slate-500">
            Razón social
            <input
              className={inputCls}
              value={empresa}
              onChange={(e) => {
                setEmpresa(e.target.value);
                guardarDatos(e.target.value, patronal);
              }}
            />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            N° patronal
            <input
              className={inputCls}
              value={patronal}
              onChange={(e) => {
                setPatronal(e.target.value);
                guardarDatos(empresa, e.target.value);
              }}
            />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Otros haberes (Gs.)
            <MontoInput className={inputCls} value={otros} onChange={setOtros} decimals={false} />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Descuentos (Gs.)
            <MontoInput className={inputCls} value={descuentos} onChange={setDescuentos} decimals={false} />
          </label>
        </div>

        <div className="factura-imprimible p-6 text-sm text-slate-900">
          <div className="border-2 border-slate-800 p-5">
            <p className="text-center text-lg font-bold uppercase">{empresa}</p>
            <p className="text-center text-xs">N° patronal MTESS: {patronal || "—"}</p>
            <p className="mt-3 text-center text-base font-bold tracking-wide">RECIBO DE SALARIOS</p>
            <p className="text-center text-xs">Conforme al Art. 235 del C.T.</p>

            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1">
              <p><b>Empleado:</b> {nombre}</p>
              <p><b>C.I. N°:</b> {funcionario?.ci ?? "—"}</p>
              <p><b>Período liquidado:</b> {nombrePeriodo(pago.periodo)}</p>
              <p><b>Fecha de pago:</b> {fechaCorta(pago.fecha_pago)}</p>
              {funcionario?.cargo ? <p><b>Cargo:</b> {funcionario.cargo}</p> : null}
            </div>

            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr className="border-y border-slate-800">
                  <th className="py-1 text-left">Concepto</th>
                  <th className="py-1 text-right">Haberes</th>
                  <th className="py-1 text-right">Descuentos</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-1">Salario básico</td>
                  <td className="py-1 text-right tabular-nums">{miles(basico)}</td>
                  <td />
                </tr>
                <tr>
                  <td className="py-1">Otros haberes</td>
                  <td className="py-1 text-right tabular-nums">{miles(otros)}</td>
                  <td />
                </tr>
                <tr>
                  <td className="py-1">Descuentos</td>
                  <td />
                  <td className="py-1 text-right tabular-nums">{miles(descuentos)}</td>
                </tr>
                <tr>
                  <td className="py-1">IPS 9%{aportaIps ? "" : " (no aporta)"}</td>
                  <td />
                  <td className="py-1 text-right tabular-nums">{miles(ips)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-800 font-bold">
                  <td className="py-1.5">NETO A PERCIBIR</td>
                  <td className="py-1.5 text-right tabular-nums" colSpan={2}>Gs. {miles(neto)}</td>
                </tr>
              </tfoot>
            </table>

            <p className="mt-3">
              <b>Son guaraníes:</b> {numeroALetras(neto)}.
            </p>
            <p className="mt-3 text-xs">
              Recibí de {empresa} la suma indicada en concepto de salario del período {nombrePeriodo(pago.periodo)}, sin tener
              nada más que reclamar por este concepto.
            </p>

            <div className="mt-14 grid grid-cols-2 gap-10 text-center text-xs">
              <div className="border-t border-slate-800 pt-1">Firma del empleado</div>
              <div className="border-t border-slate-800 pt-1">Aclaración y C.I. N°</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
