"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, Package, RefreshCw, Search, Truck, X } from "lucide-react";
import CamionesPanel from "@/shared/caja/CamionesPanel";
import InventarioCamion from "./InventarioCamion";
import ComprasCamion from "./ComprasCamion";
import { useCamiones, useObjetivos } from "@/shared/hooks/useRepartos";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { compararPorCodigo, formatCantidad, parseCantidad } from "@/lib/inventario/unidades";
import type { ObjetivoCamion } from "@/lib/repartos/types";

const TEAL = "#4FAEB2";

type Modo = "ver" | "contar" | "salon" | "cargar";

/**
 * Módulo Camiones. Sin repartos que abrir ni cerrar: cada camión tiene un
 * usuario asignado y un stock que está siempre vivo — sube con las compras que
 * lo tienen de destino y baja con las ventas de quien lo maneja.
 *
 * Desde acá se lo cuenta (el físico manda, cada diferencia con su motivo) y se
 * baja al salón lo que sobra.
 */
export default function CamionesModulo() {
  const { camiones, isLoading: cargandoCamiones } = useCamiones();
  const [camionId, setCamionId] = useState<string | null>(null);
  const elegido = camiones.find((c) => c.id === camionId) ?? camiones[0] ?? null;

  return (
    <div className="mx-auto max-w-5xl p-4 pb-24 sm:p-6">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          <Truck className="h-6 w-6 text-slate-400" />
          Camiones
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          A quién está asignado cada camión y qué lleva arriba. La carga entra por Compras.
        </p>
      </header>

      <CamionesPanel />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Package className="h-4 w-4 text-slate-400" />
          Stock del camión
        </h2>

        {cargandoCamiones ? (
          <p className="py-6 text-sm text-slate-400">Cargando camiones…</p>
        ) : camiones.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">No hay camiones activos.</p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              {camiones.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCamionId(c.id)}
                  className={`rounded-xl border-2 px-3 py-2 text-left text-sm transition-colors ${
                    elegido?.id === c.id
                      ? "border-[#4FAEB2] bg-[#4FAEB2]/10"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="block font-semibold text-slate-900">{c.alias}</span>
                  <span className="block text-xs text-slate-500">{c.repartidor ?? "Sin asignar"}</span>
                </button>
              ))}
            </div>
            {elegido ? <StockDe key={elegido.id} camionId={elegido.id} alias={elegido.alias} /> : null}
          </>
        )}
      </section>
    </div>
  );
}

function StockDe({ camionId, alias }: { camionId: string; alias: string }) {
  const { objetivos: items, isLoading, error, mutate } = useObjetivos(camionId);
  const [modo, setModo] = useState<Modo>("ver");
  const [verTodos, setVerTodos] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [version, setVersion] = useState(0);
  /** Qué se mira del camión: sus compras (cada una se despliega) o el inventario. */
  const [vista, setVista] = useState<"compras" | "inventario">("compras");

  // Al contar se pueden encontrar productos que no figuraban: con "ver todos"
  // aparece el catálogo entero. Al cargar del salón también se ve todo, porque
  // se cargan productos que el camión todavía no tiene.
  // Búsqueda por código o nombre: con el código exacto + Enter se salta
  // directo a la cantidad de ese producto, como en la caja.
  const [buscar, setBuscar] = useState("");
  const refBuscar = useRef<HTMLInputElement>(null);
  const ordenados = useMemo(
    () => [...items].sort((a, b) => compararPorCodigo({ sku: a.codigo ?? "", nombre: a.nombre }, { sku: b.codigo ?? "", nombre: b.nombre })),
    [items]
  );
  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (q) {
      // Buscando se mira todo el catálogo: el producto puede no estar arriba todavía.
      const base = modo === "salon" ? ordenados.filter((i) => i.actual > 0) : ordenados;
      return base.filter((i) => (i.codigo ?? "").toLowerCase().startsWith(q) || i.nombre.toLowerCase().includes(q));
    }
    return verTodos || modo === "cargar" ? ordenados : ordenados.filter((i) => i.actual > 0);
  }, [ordenados, verTodos, modo, buscar]);

  /** Enter en el buscador: si el código coincide con uno, va a su cantidad. */
  function irAlCodigo() {
    const q = buscar.trim().toLowerCase();
    if (!q) return;
    const exacto = items.find((i) => (i.codigo ?? "").toLowerCase() === q) ?? (visibles.length === 1 ? visibles[0] : null);
    if (!exacto) return;
    setBuscar(exacto.codigo || exacto.nombre);
    setTimeout(() => document.getElementById(`cant-${exacto.producto_id}`)?.focus(), 0);
  }

  /** Enter en una cantidad: vuelve al buscador para el código siguiente. */
  function siguienteCodigo() {
    setBuscar("");
    setTimeout(() => refBuscar.current?.focus(), 0);
  }

  /** Lo que ya tiene cantidad, para verlo aunque la búsqueda lo esconda. */
  const cargados = modo === "contar" ? [] : items.filter((i) => valorDe(i) > 0);

  function cambiarModo(m: Modo) {
    setModo(m);
    setBuscar("");
    setValores({});
    setMotivos({});
    setAviso(null);
  }

  function valorDe(i: ObjetivoCamion): number {
    const raw = valores[i.producto_id];
    if (raw === undefined || raw.trim() === "") return modo === "contar" ? i.actual : 0;
    return parseCantidad(raw, i.unidad);
  }

  async function guardar() {
    if (guardando) return;
    setAviso(null);
    let url: string;
    let payload: unknown[];
    if (modo === "contar") {
      const cambios = items.filter((i) => valores[i.producto_id] !== undefined && valorDe(i) !== i.actual);
      if (cambios.length === 0) {
        setAviso({ ok: true, texto: "Todo coincide: no hay diferencias para ajustar." });
        cambiarModo("ver");
        return;
      }
      const sinMotivo = cambios.filter((i) => !(motivos[i.producto_id] ?? "").trim());
      if (sinMotivo.length > 0) {
        setAviso({ ok: false, texto: `Poné el motivo de la diferencia en: ${sinMotivo.map((i) => i.nombre).join(", ")}.` });
        return;
      }
      url = `/api/camiones/${camionId}/conteo`;
      payload = cambios.map((i) => ({ producto_id: i.producto_id, contado: valorDe(i), motivo: motivos[i.producto_id] }));
    } else {
      const aMover = items.filter((i) => valorDe(i) > 0);
      if (aMover.length === 0) {
        setAviso({
          ok: false,
          texto:
            modo === "salon"
              ? "Poné cuánto pasar al salón de algún producto."
              : "Poné cuánto cargar al camión de algún producto.",
        });
        return;
      }
      url =
        modo === "salon"
          ? `/api/camiones/${camionId}/a-salon`
          : `/api/camiones/${camionId}/desde-salon`;
      payload = aMover.map((i) => ({ producto_id: i.producto_id, cantidad: valorDe(i) }));
    }

    setGuardando(true);
    try {
      const res = await fetchWithSupabaseSession(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setAviso({ ok: false, texto: j.error ?? "No se pudo guardar." });
        return;
      }
      await mutate();
      setVersion((v) => v + 1);
      setAviso({
        ok: true,
        texto:
          modo === "contar"
            ? `Conteo de ${alias} guardado.`
            : modo === "salon"
              ? `Mercadería pasada del ${alias} al salón.`
              : `Mercadería cargada del salón al ${alias}.`,
      });
      setModo("ver");
      setValores({});
      setMotivos({});
    } finally {
      setGuardando(false);
    }
  }

  const total = useMemo(() => items.reduce((s, i) => s + (i.actual > 0 ? 1 : 0), 0), [items]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {modo === "ver" ? (
          <>
            <button
              type="button"
              onClick={() => cambiarModo("contar")}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ClipboardCheck className="h-4 w-4" />
              Contar
            </button>
            <button
              type="button"
              onClick={() => cambiarModo("cargar")}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowUpFromLine className="h-4 w-4" />
              Cargar del salón
            </button>
            <button
              type="button"
              onClick={() => cambiarModo("salon")}
              disabled={total === 0}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ArrowDownToLine className="h-4 w-4" />
              Pasar al salón
            </button>
          </>
        ) : (
          <p className="text-sm font-semibold text-slate-900">
            {modo === "contar"
              ? "Escribí lo que contaste arriba del camión. Si no coincide, poné el motivo."
              : modo === "salon"
                ? "Escribí cuánto baja al salón de cada producto."
                : "Escribí cuánto cargar del salón al camión."}
          </p>
        )}
        {modo !== "ver" ? (
          <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" checked={verTodos} onChange={(e) => setVerTodos(e.target.checked)} />
            Ver todos los productos
          </label>
        ) : null}
        <button
          type="button"
          onClick={() => {
            void mutate();
            setVersion((v) => v + 1);
          }}
          aria-label="Actualizar"
          className={`rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 ${modo === "ver" ? "ml-auto" : ""}`}
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {modo === "ver" ? (
        <>
          <div className="mb-3 flex gap-1 border-b border-slate-200">
            {(
              [
                ["compras", "Compras"],
                ["inventario", "Inventario"],
              ] as const
            ).map(([v, texto]) => (
              <button
                key={v}
                type="button"
                onClick={() => setVista(v)}
                className={`border-b-2 px-3 py-2 text-sm font-semibold ${
                  vista === v ? "border-[#4FAEB2] text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {texto}
              </button>
            ))}
          </div>
          {vista === "compras" ? (
            <ComprasCamion camionId={camionId} version={version} />
          ) : (
            <InventarioCamion camionId={camionId} version={version} />
          )}
        </>
      ) : null}

      {modo !== "ver" ? (
        <div className="mb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={refBuscar}
              autoFocus
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  irAlCodigo();
                }
              }}
              placeholder="Código o nombre del producto (Enter para ir a la cantidad)"
              aria-label="Buscar producto por código o nombre"
              className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            />
            {buscar ? (
              <button
                type="button"
                onClick={() => siguienteCodigo()}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          {cargados.length > 0 ? (
            <p className="mt-2 text-xs text-slate-600">
              <span className="font-semibold">{cargados.length} {cargados.length === 1 ? "producto" : "productos"}:</span>{" "}
              {cargados.map((i) => `${i.codigo ? `${i.codigo} ` : ""}${i.nombre} (${formatCantidad(valorDe(i), i.unidad)})`).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {modo === "ver" ? null : error ? (
        <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error.message}</p>
      ) : isLoading ? (
        <p className="py-6 text-sm text-slate-400">Cargando stock…</p>
      ) : visibles.length === 0 && buscar.trim() ? (
        <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">
          {modo === "salon" ? "El camión no tiene ningún producto con ese código o nombre." : "No hay ningún producto con ese código o nombre."}
        </p>
      ) : visibles.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">
          El camión está vacío. Usá “Cargar del salón” para subirle mercadería, o cargalo con una
          compra que tenga a {alias} como destino.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {visibles.map((i) => {
            const v = valorDe(i);
            const diferencia = modo === "contar" && valores[i.producto_id] !== undefined && v !== i.actual;
            return (
              <li key={i.producto_id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1 basis-48 text-sm text-slate-900">
                  {i.codigo ? <span className="mr-2 font-mono text-xs text-slate-500">{i.codigo}</span> : null}
                  {i.nombre}
                </span>
                <span className="w-28 text-right text-sm tabular-nums text-slate-600">
                  {formatCantidad(i.actual, i.unidad)} {i.unidad}
                </span>
                <span className="flex items-center gap-1.5">
                  <input
                    id={`cant-${i.producto_id}`}
                    inputMode="decimal"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        siguienteCodigo();
                      }
                    }}
                    value={valores[i.producto_id] ?? ""}
                    onChange={(e) => setValores((p) => ({ ...p, [i.producto_id]: e.target.value }))}
                    placeholder={modo === "contar" ? formatCantidad(i.actual, i.unidad) : "0"}
                    aria-label={`${modo === "contar" ? "Contado" : modo === "salon" ? "A pasar" : "A cargar"} de ${i.nombre}`}
                    className={`h-9 w-24 rounded-lg border px-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-[#4FAEB2] ${
                      diferencia ? "border-amber-400" : "border-slate-200"
                    }`}
                  />
                  {modo === "salon" && i.actual > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setValores((p) => ({ ...p, [i.producto_id]: formatCantidad(i.actual, i.unidad) }))
                      }
                      className="rounded-lg px-2 py-1 text-xs font-medium text-[#3F8E91] hover:bg-slate-50"
                    >
                      Todo
                    </button>
                  ) : null}
                </span>
                {diferencia ? (
                  <input
                    value={motivos[i.producto_id] ?? ""}
                    onChange={(e) => setMotivos((p) => ({ ...p, [i.producto_id]: e.target.value }))}
                    placeholder={`Motivo (${v > i.actual ? "sobra" : "falta"} ${formatCantidad(Math.abs(v - i.actual), i.unidad)})`}
                    className="h-9 w-full rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm outline-none focus:ring-2 focus:ring-amber-300"
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {aviso ? (
        <p
          role="status"
          className={`mt-3 rounded-lg p-3 text-xs ${aviso.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
        >
          {aviso.texto}
        </p>
      ) : null}

      {modo !== "ver" ? (
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => cambiarModo("ver")}
            className="h-10 rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="h-10 rounded-lg px-5 text-sm font-semibold text-white disabled:opacity-40"
            style={{ backgroundColor: TEAL }}
          >
            {guardando
              ? "Guardando…"
              : modo === "contar"
                ? "Guardar conteo"
                : modo === "salon"
                  ? "Pasar al salón"
                  : "Cargar al camión"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
