"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Printer } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { formatCantidad } from "@/lib/inventario/unidades";

type Fila = {
  producto_id: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  precio_venta: number;
  saldo_inicial: number;
  cargada: number;
  vendida: number;
  otros: number;
  saldo: number;
};

type Movimiento = {
  fecha: string;
  tipo: "carga_compra" | "carga_salon" | "a_salon" | "venta" | "anulacion" | "ajuste" | "otro";
  producto: string;
  codigo: string;
  cantidad: number;
  referencia: string | null;
  usuario: string | null;
};

type Datos = { alias: string; lista: string; desde: string; items: Fila[]; movimientos: Movimiento[] };

const TIPO: Record<Movimiento["tipo"], string> = {
  carga_compra: "Carga por compra",
  carga_salon: "Carga del salón",
  a_salon: "Bajado al salón",
  venta: "Venta",
  anulacion: "Anulación",
  ajuste: "Ajuste de conteo",
  otro: "Otro",
};

function hoy(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
}
function haceDias(n: number): string {
  const d = new Date(`${hoy()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-PY", {
    timeZone: "America/Asuncion",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
const gs = (n: number) => Math.round(n).toLocaleString("es-PY");

/**
 * Inventario del camión (punto 8): código, descripción, precio de venta,
 * cargado, vendido y saldo, desde la fecha elegida. Debajo, el listado de
 * cargas y transferencias del mismo período (punto 9).
 */
export default function InventarioCamion({ camionId, version }: { camionId: string; version: number }) {
  const [periodo, setPeriodo] = useState<"hoy" | "7" | "30" | "fecha">("hoy");
  const [fecha, setFecha] = useState(hoy());
  const [busca, setBusca] = useState("");
  const [soloConMovimiento, setSoloConMovimiento] = useState(true);
  const desde = periodo === "hoy" ? hoy() : periodo === "7" ? haceDias(6) : periodo === "30" ? haceDias(29) : fecha;

  const { data, error, isLoading } = useSWR<Datos>(
    ["camion-inventario", camionId, desde, version],
    async () => {
      const res = await fetchWithSupabaseSession(`/api/camiones/${camionId}/inventario?desde=${desde}`);
      const j = (await res.json().catch(() => ({}))) as { data?: Datos; error?: string };
      if (!res.ok || !j.data) throw new Error(j.error ?? "No se pudo leer el inventario del camión.");
      return j.data;
    },
    { revalidateOnFocus: true, keepPreviousData: true }
  );

  const filas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (data?.items ?? []).filter(
      (f) =>
        (!soloConMovimiento || f.saldo !== 0 || f.cargada !== 0 || f.vendida !== 0 || f.otros !== 0) &&
        (!q || `${f.codigo} ${f.descripcion}`.toLowerCase().includes(q))
    );
  }, [data, busca, soloConMovimiento]);

  const hayOtros = filas.some((f) => f.otros !== 0);
  const valorSaldo = filas.reduce((s, f) => s + f.saldo * f.precio_venta, 0);

  return (
    <div className="factura-imprimible">
      <div className="no-imprimir mb-3 flex flex-wrap items-center gap-2">
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value as typeof periodo)}
          className="h-9 rounded-lg border border-slate-200 px-2 text-sm"
          aria-label="Período"
        >
          <option value="hoy">Hoy</option>
          <option value="7">Últimos 7 días</option>
          <option value="30">Últimos 30 días</option>
          <option value="fecha">Desde una fecha…</option>
        </select>
        {periodo === "fecha" ? (
          <input
            type="date"
            value={fecha}
            max={hoy()}
            onChange={(e) => setFecha(e.target.value || hoy())}
            className="h-9 rounded-lg border border-slate-200 px-2 text-sm"
          />
        ) : null}
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar código o producto…"
          className="h-9 min-w-0 flex-1 basis-40 rounded-lg border border-slate-200 px-3 text-sm"
        />
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <input type="checkbox" checked={!soloConMovimiento} onChange={(e) => setSoloConMovimiento(!e.target.checked)} />
          Ver todos los productos
        </label>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50"
        >
          <Printer className="h-4 w-4" />
          Imprimir
        </button>
      </div>

      <div className="mb-2 hidden print:block">
        <p className="text-base font-bold">Inventario del camión {data?.alias}</p>
        <p className="text-xs">Desde {desde.split("-").reverse().join("/")} · lista {data?.lista}</p>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{(error as Error).message}</p>
      ) : isLoading && !data ? (
        <p className="py-6 text-sm text-slate-400">Cargando inventario…</p>
      ) : filas.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">
          El camión está vacío y no tuvo movimientos en el período.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2 text-right">Precio venta</th>
                <th className="px-3 py-2 text-right" title="Lo que tenía al empezar el período">Inicial</th>
                <th className="px-3 py-2 text-right">Cargada</th>
                <th className="px-3 py-2 text-right">Vendida</th>
                {hayOtros ? (
                  <th className="px-3 py-2 text-right" title="Bajado al salón y ajustes de conteo">Otros</th>
                ) : null}
                <th className="px-3 py-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((f) => (
                <tr key={f.producto_id} className="text-slate-800">
                  <td className="px-3 py-2 tabular-nums text-slate-500">{f.codigo || "—"}</td>
                  <td className="max-w-72 truncate px-3 py-2">{f.descripcion}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{gs(f.precio_venta)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{formatCantidad(f.saldo_inicial, f.unidad)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.cargada ? formatCantidad(f.cargada, f.unidad) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.vendida ? formatCantidad(f.vendida, f.unidad) : "—"}</td>
                  {hayOtros ? (
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {f.otros ? `${f.otros > 0 ? "+" : ""}${formatCantidad(f.otros, f.unidad)}` : "—"}
                    </td>
                  ) : null}
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${f.saldo < 0 ? "text-red-600" : "text-slate-900"}`}
                  >
                    {formatCantidad(f.saldo, f.unidad)} {f.unidad}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filas.length > 0 ? (
        <p className="mt-2 text-right text-xs text-slate-500">
          Saldo valorizado a precio de venta: <b className="text-slate-800">Gs. {gs(valorSaldo)}</b>
        </p>
      ) : null}

      <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-900">Cargas y transferencias</h3>
      {(data?.movimientos.length ?? 0) === 0 ? (
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Sin cargas ni transferencias en el período.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Movimiento</th>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2">Detalle</th>
                <th className="px-3 py-2">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data!.movimientos.map((m, i) => (
                <tr key={i} className="text-slate-800">
                  <td className="px-3 py-2 tabular-nums text-slate-500">{fechaHora(m.fecha)}</td>
                  <td className="px-3 py-2">{TIPO[m.tipo]}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-500">{m.codigo || "—"}</td>
                  <td className="max-w-56 truncate px-3 py-2">{m.producto}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${m.cantidad < 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {m.cantidad > 0 ? "+" : ""}
                    {m.cantidad.toLocaleString("es-PY", { maximumFractionDigits: 3 })}
                  </td>
                  <td className="max-w-64 truncate px-3 py-2 text-xs text-slate-500">{m.referencia ?? ""}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{m.usuario ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
