"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deleteProducto, getProductos } from "@/lib/inventario/storage";
import type { Producto } from "@/lib/inventario/types";
import { Pencil, Trash2 } from "lucide-react";
import MiniaturaProducto from "@/components/inventario/MiniaturaProducto";
import { formatCantidad } from "@/lib/inventario/unidades";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import ImportExcelButton from "@/components/ui/ImportExcelButton";
import { useIsAdmin } from "@/lib/auth/use-is-admin";

const inputFilterClass =
  "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#4FAEB2]/40 focus:border-[#4FAEB2] focus:outline-none";

function formatGs(valor: number) {
  return `Gs. ${valor.toLocaleString("es-PY")}`;
}

function calcularMargenVenta(costo: number, precio: number): number {
  if (precio === 0) return 0;
  return ((precio - costo) / precio) * 100;
}

function margenColor(margen: number): string {
  if (margen >= 40) return "text-green-600";
  if (margen >= 20) return "text-yellow-600";
  return "text-red-600";
}

interface UbicacionMin { id: string; nombre: string; tipo: string }

export default function InventarioPage() {
  const { isAdmin } = useIsAdmin();
  const [todos, setTodos] = useState<Producto[]>([]);
  const [ubicaciones, setUbicaciones] = useState<UbicacionMin[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // Borrado: el producto elegido, el error del intento y el aviso de cómo
  // terminó (borrado de verdad o desactivado por tener historial).
  const [porBorrar, setPorBorrar] = useState<Producto | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Busqueda unica global + paginado
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState<25 | 50 | 100 | "all">(25);

  useEffect(() => {
    let cancelled = false;
    getProductos().then((data) => {
      if (!cancelled) setTodos(data);
    });
    // Ubicaciones para el filtro
    fetch("/api/inventario/ubicaciones", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        setUbicaciones((j.data?.ubicaciones ?? []) as UbicacionMin[]);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [refreshKey]);

  const ubicacionById = new Map(ubicaciones.map((u) => [u.id, u]));

  // Filtro unico: matchea contra cualquier dato visible del producto.
  // El query se separa por palabras y todas deben matchear (AND), case-insensitive.
  const filtradosTodos = todos.filter((p) => {
    const q = query.trim().toLowerCase();
    if (q === "") return true;
    const u = p.ubicacion_principal_id ? ubicacionById.get(p.ubicacion_principal_id) : null;
    const haystack = [
      p.nombre,
      p.sku,
      String(p.costo_promedio),
      p.costo_promedio.toLocaleString("es-PY"),
      String(p.precio_venta),
      p.precio_venta.toLocaleString("es-PY"),
      String(p.stock_actual),
      String(p.stock_minimo),
      p.unidad_medida,
      u?.nombre ?? "",
      u?.tipo ?? "",
    ]
      .join(" • ")
      .toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    return terms.every((t) => haystack.includes(t));
  });

  const productos =
    pageSize === "all" ? filtradosTodos : filtradosTodos.slice(0, pageSize);

  async function confirmarBorrado() {
    if (!porBorrar) return;
    setBorrando(true);
    setErrorBorrado(null);
    try {
      const r = await deleteProducto(porBorrar.id);
      setPorBorrar(null);
      setAviso(
        r.modo === "eliminado"
          ? `${r.nombre} se borró.`
          : `${r.nombre} tenía ventas o compras registradas, así que se dio de baja: sale del listado y de la caja, pero sigue apareciendo en los informes anteriores.`
      );
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setErrorBorrado(err instanceof Error ? err.message : "No se pudo borrar el producto.");
    } finally {
      setBorrando(false);
    }
  }

  return (
    <div className="space-y-6 pb-10">

      {/* Header tipo Dashboard */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Operaciones · Stock
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Inventario</h1>
          <p className="mt-1 text-sm text-slate-500">Gestión de productos y control de stock</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportExcelButton url="/api/inventario/productos/export" />
          <ImportExcelButton
            entidad="Productos"
            previewUrl="/api/inventario/productos/import/preview"
            commitUrl="/api/inventario/productos/import/commit"
            templateUrl="/api/inventario/productos/import/template"
            permiteCrearFaltantes
            visible={isAdmin}
            onCompleted={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Productos
            </h2>
          </div>
          <Link
            href="/inventario/nuevo"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
          >
            + Nuevo producto
          </Link>
          <div className="relative min-w-[16rem] flex-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
                clipRule="evenodd"
              />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, SKU, costo, precio, stock, unidad, ubicación, valuación…"
              className={`${inputFilterClass} w-full pl-9`}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              Filas
            </label>
            <select
              value={String(pageSize)}
              onChange={(e) => {
                const v = e.target.value;
                setPageSize(v === "all" ? "all" : (Number(v) as 25 | 50 | 100));
              }}
              className={inputFilterClass}
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="all">Todo</option>
            </select>
          </div>
          <span className="ml-auto text-[11px] text-slate-400">
            {productos.length} de {filtradosTodos.length}
            {filtradosTodos.length !== todos.length ? ` · ${todos.length} en total` : ""}
            {" "}producto{filtradosTodos.length === 1 ? "" : "s"}
          </span>
          <p className="hidden text-[11px] text-slate-400 xl:block">
            Los productos ingresan desde <span className="font-medium text-slate-500">Compras</span>
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">

            <thead>
              <tr className="bg-slate-50 text-slate-600 text-sm font-semibold">
                <th className="py-3 pr-4 font-medium">Nombre</th>
                <th className="py-3 pr-4 font-medium">SKU</th>
                <th className="py-3 pr-4 font-medium">Costo Prom.</th>
                <th className="py-3 pr-4 font-medium">Precio Venta</th>
                <th className="py-3 pr-4 font-medium text-center">Stock</th>
                <th className="py-3 pr-4 font-medium text-center">Stock Mín.</th>
                <th className="py-3 pr-4 font-medium">Unidad</th>
                <th className="py-3 pr-4 font-medium">Ubicación</th>
                <th className="py-3 font-medium text-right">
                  <span title="(precio - costo) / precio × 100">Margen s/venta</span>
                </th>
                <th className="py-3 font-medium text-right w-40">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {productos.map((p) => {
                const stockBajo = p.stock_actual <= p.stock_minimo;
                const margen = calcularMargenVenta(p.costo_promedio, p.precio_venta);
                return (
                  <tr key={p.id} className="border-b border-slate-200 last:border-0 hover:bg-slate-50 transition-colors">
                    {/* La foto va dentro de la columna del nombre y no en una
                        propia: la tabla ya es ancha y una columna más obligaría
                        a scrollear para llegar a los botones. */}
                    <td className="py-3 pr-4 font-medium text-gray-800">
                      <div className="flex items-center gap-3">
                        <MiniaturaProducto producto={p} size="sm" />
                        <span>{p.nombre}</span>
                      </div>
                    </td>
                    <td className="py-4 pr-4 text-gray-500 font-mono">{p.sku}</td>
                    <td className="py-4 pr-4 text-gray-700">{formatGs(p.costo_promedio)}</td>
                    <td className="py-4 pr-4 text-gray-700">{formatGs(p.precio_venta)}</td>
                    <td className="py-4 pr-4 text-center">
                      <span className={`font-semibold ${stockBajo ? "text-red-600" : "text-gray-800"}`}>
                        {formatCantidad(p.stock_actual, p.unidad_medida)}
                      </span>
                    </td>
                    <td className="py-4 pr-4 text-center text-gray-500">
                      {formatCantidad(p.stock_minimo, p.unidad_medida)}
                    </td>
                    <td className="py-4 pr-4 text-gray-600">{p.unidad_medida}</td>
                    <td className="py-4 pr-4 text-gray-600 text-xs">
                      {p.ubicacion_principal_id
                        ? (() => {
                            const u = ubicacionById.get(p.ubicacion_principal_id);
                            return u ? (
                              <span>
                                <span className="font-medium text-gray-700">{u.nombre}</span>
                                <span className="text-gray-400"> — {u.tipo}</span>
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            );
                          })()
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`py-4 text-right tabular-nums font-semibold ${margenColor(margen)}`}>
                      {margen.toFixed(2)}%
                    </td>
                    <td className="py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/inventario/${p.id}/editar`}
                          title={`Editar ${p.nombre}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-[#4FAEB2] hover:bg-[#4FAEB2]/10 hover:text-[#3F8E91]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </Link>
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => setPorBorrar(p)}
                            title={`Borrar ${p.nombre}`}
                            aria-label={`Borrar ${p.nombre}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Borrar
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>

          </table>
        </div>

      </section>

      {aviso ? (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600"
        >
          <span>{aviso}</span>
          <button
            type="button"
            onClick={() => setAviso(null)}
            className="shrink-0 text-xs font-medium text-slate-400 hover:text-slate-600"
          >
            Cerrar
          </button>
        </div>
      ) : null}

      {porBorrar ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Borrar producto</h2>
            <p className="mt-2 text-sm text-slate-600">
              ¿Borrar <span className="font-semibold text-slate-900">{porBorrar.nombre}</span>?
              Deja de aparecer en el inventario y en la caja.
            </p>
            {porBorrar.stock_actual > 0 ? (
              <p className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
                Todavía tiene {formatCantidad(porBorrar.stock_actual, porBorrar.unidad_medida)}{" "}
                {porBorrar.unidad_medida} en stock.
              </p>
            ) : null}
            <p className="mt-2 text-xs text-slate-400">
              Si ya se vendió o se compró alguna vez, no se borra: se da de baja, para no dejar
              los informes anteriores hablando de un producto que no existe.
            </p>

            {errorBorrado ? (
              <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
                {errorBorrado}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPorBorrar(null);
                  setErrorBorrado(null);
                }}
                disabled={borrando}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarBorrado}
                disabled={borrando}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {borrando ? "Borrando…" : "Borrar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
