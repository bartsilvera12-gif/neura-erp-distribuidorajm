"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface Categoria {
  id: string;
  nombre: string;
  codigo: string | null;
  descripcion: string | null;
  parent_id: string | null;
  activo: boolean;
  productos_count?: number;
}

interface ProductoDeCategoria {
  id: string;
  nombre: string;
  sku: string;
  precio_venta: number | string;
  costo_promedio: number | string;
  stock_actual: number | string;
  unidad_medida: string;
}

const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#4FAEB2]/40 focus:border-[#4FAEB2] focus:outline-none";
const labelCls =
  "block text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 mb-1";

export default function CategoriasProductosPage() {
  const [items, setItems] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form alta
  const [nombre, setNombre] = useState("");
  const [parentId, setParentId] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/inventario/categorias?todas=1", { credentials: "include" });
      const j = await r.json();
      if (r.ok && j?.success) setItems(j.data.categorias as Categoria[]);
      else setError(j?.error ?? "No se pudo cargar.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const r = await fetch("/api/inventario/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          nombre: nombre.trim(),
          parent_id: parentId || null,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.success) {
        setError(j?.error ?? "No se pudo crear.");
      } else {
        setNombre(""); setParentId("");
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCreating(false);
    }
  }

  // Edición en la fila y confirmación de borrado.
  const [editId, setEditId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editParent, setEditParent] = useState("");
  const [porBorrar, setPorBorrar] = useState<Categoria | null>(null);
  const [borrando, setBorrando] = useState(false);

  // Ver los productos de una categoría (al tocar el número / el nombre).
  const [verProductosDe, setVerProductosDe] = useState<Categoria | null>(null);
  const [productos, setProductos] = useState<ProductoDeCategoria[]>([]);
  const [cargandoProductos, setCargandoProductos] = useState(false);

  async function abrirProductos(cat: Categoria) {
    setVerProductosDe(cat);
    setProductos([]);
    setCargandoProductos(true);
    try {
      const r = await fetch(`/api/inventario/categorias/${cat.id}/productos`, { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.success) setProductos((j.data?.productos ?? []) as ProductoDeCategoria[]);
    } catch {
      // Si falla, el modal queda sin lista; el usuario puede cerrarlo y reintentar.
    } finally {
      setCargandoProductos(false);
    }
  }

  const fmtGs = (n: number | string) =>
    "Gs. " + Math.round(Number(n) || 0).toLocaleString("es-PY");

  async function guardarEdicion(cat: Categoria) {
    const nombre = editNombre.trim();
    if (!nombre) return;
    const r = await fetch(`/api/inventario/categorias/${cat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ nombre, parent_id: editParent || null }),
    });
    const j = await r.json();
    if (r.ok && j?.success) { setEditId(null); load(); }
    else setError(j?.error ?? "No se pudo guardar.");
  }

  async function borrar(cat: Categoria) {
    setBorrando(true);
    setError(null);
    try {
      const r = await fetch(`/api/inventario/categorias/${cat.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.success) { setPorBorrar(null); load(); }
      // El servidor explica por qué no se puede (sub-categorías, productos).
      else setError(j?.error ?? "No se pudo borrar.");
    } finally {
      setBorrando(false);
    }
  }

  async function toggleActivo(cat: Categoria) {
    const r = await fetch(`/api/inventario/categorias/${cat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ activo: !cat.activo }),
    });
    const j = await r.json();
    if (r.ok && j?.success) load();
    else setError(j?.error ?? "No se pudo actualizar.");
  }

  // Ordenar: padres primero (alfabético) y debajo sus hijos. Subcategorías indentadas.
  const itemsOrdenados = useMemo(() => {
    const byParent = new Map<string | null, Categoria[]>();
    for (const c of items) {
      const arr = byParent.get(c.parent_id) ?? [];
      arr.push(c);
      byParent.set(c.parent_id, arr);
    }
    for (const arr of byParent.values()) {
      arr.sort((a, b) => a.nombre.localeCompare(b.nombre));
    }
    const out: Array<Categoria & { nivel: 0 | 1 }> = [];
    const padres = byParent.get(null) ?? [];
    for (const p of padres) {
      out.push({ ...p, nivel: 0 });
      const hijos = byParent.get(p.id) ?? [];
      for (const h of hijos) out.push({ ...h, nivel: 1 });
    }
    // Por si vienen categorías huérfanas (parent_id que no existe en items)
    const idsIncluidos = new Set(out.map((c) => c.id));
    for (const c of items) {
      if (!idsIncluidos.has(c.id)) out.push({ ...c, nivel: 0 });
    }
    return out;
  }, [items]);

  // Para el select de padre solo se pueden elegir categorías de nivel 0 activas
  // (las que ya son subcategoría no pueden tener hijos a su vez).
  const padresDisponibles = useMemo(
    () => items.filter((i) => i.activo && i.parent_id == null),
    [items],
  );

  return (
    <div className="space-y-6 pb-10">

      {/* Breadcrumb / volver */}
      <div>
        <Link
          href="/inventario"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#3F8E91] transition-colors hover:text-[#2f6c6f]"
        >
          ← Volver a Inventario
        </Link>
      </div>

      {/* Header tipo Dashboard */}
      <div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
          />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
            Operaciones · Categorías
          </p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          Categorías de productos
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Clasificá tus productos para reportes y búsqueda. Cada categoría puede tener sub-categorías eligiendo
          una <span className="font-medium text-slate-600">Categoría padre</span>.
        </p>
      </div>

      {/* Alta */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Nueva categoría
          </h2>
        </div>
        <form onSubmit={handleCrear} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
          <div>
            <label className={labelCls}>Nombre</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: BEBIDAS"
              className={inputCls}
              required
            />
          </div>
          <div>
            <label className={labelCls}>
              Categoría padre <span className="font-normal normal-case tracking-normal text-slate-400">— opcional, para crear una sub-categoría</span>
            </label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className={inputCls}
            >
              <option value="">— ninguna (categoría principal) —</option>
              {padresDisponibles.map((i) => (
                <option key={i.id} value={i.id}>{i.nombre}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={creating || !nombre.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Creando..." : "+ Crear categoría"}
            </button>
          </div>
        </form>
        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error}
          </p>
        )}
      </section>

      {/* Lista */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-4">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Categorías existentes
          </h2>
          <span className="ml-auto text-[11px] text-slate-400">
            {items.length} {items.length === 1 ? "categoría" : "categorías"}
          </span>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-slate-400">Cargando...</p>
        ) : itemsOrdenados.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">Todavía no cargaste categorías.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-6 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em]">
                  Nombre
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em]">
                  Categoría padre
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em]">
                  Productos
                </th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em]">
                  Estado
                </th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {itemsOrdenados.map((c) => {
                const parent = items.find((i) => i.id === c.parent_id);
                if (editId === c.id) {
                  return (
                    <tr key={c.id} className="bg-[#4FAEB2]/5">
                      <td className="px-6 py-2">
                        <input
                          value={editNombre}
                          onChange={(e) => setEditNombre(e.target.value.toUpperCase())}
                          autoFocus
                          aria-label="Nombre de la categoría"
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm uppercase outline-none focus:border-[#4FAEB2]"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={editParent}
                          onChange={(e) => setEditParent(e.target.value)}
                          aria-label="Categoría padre"
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-[#4FAEB2]"
                        >
                          <option value="">— ninguna (categoría principal) —</option>
                          {items
                            .filter((o) => o.id !== c.id && o.parent_id == null)
                            .map((o) => (
                              <option key={o.id} value={o.id}>{o.nombre}</option>
                            ))}
                        </select>
                      </td>
                      <td className="px-4 py-2 text-slate-400">—</td>
                      <td className="px-4 py-2 text-slate-400">—</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => guardarEdicion(c)}
                            disabled={!editNombre.trim()}
                            className="text-[11px] font-semibold text-[#3F8E91] underline-offset-2 hover:underline disabled:opacity-40"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={() => setEditId(null)}
                            className="text-[11px] font-semibold text-slate-500 underline-offset-2 hover:underline"
                          >
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-medium text-slate-800">
                      <button
                        type="button"
                        onClick={() => abrirProductos(c)}
                        title="Ver los productos de esta categoría"
                        className="text-left transition-colors hover:text-[#3F8E91] hover:underline underline-offset-2"
                      >
                        {c.nivel === 1 ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-slate-300" aria-hidden="true">└─</span>
                            <span>{c.nombre}</span>
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              sub
                            </span>
                          </span>
                        ) : (
                          c.nombre
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{parent?.nombre ?? "—"}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => abrirProductos(c)}
                        className="rounded-full bg-[#4FAEB2]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#3F8E91] transition-colors hover:bg-[#4FAEB2]/20"
                      >
                        {c.productos_count ?? 0} {(c.productos_count ?? 0) === 1 ? "producto" : "productos"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {c.activo ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          Activo
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => {
                            setEditId(c.id);
                            setEditNombre(c.nombre);
                            setEditParent(c.parent_id ?? "");
                          }}
                          className="text-[11px] font-semibold text-[#3F8E91] underline-offset-2 hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => toggleActivo(c)}
                          className="text-[11px] font-semibold text-slate-500 underline-offset-2 hover:underline"
                        >
                          {c.activo ? "Desactivar" : "Activar"}
                        </button>
                        <button
                          onClick={() => { setPorBorrar(c); setError(null); }}
                          className="text-[11px] font-semibold text-rose-600 underline-offset-2 hover:underline"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {porBorrar ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-slate-800">
              Eliminar «{porBorrar.nombre}»
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Solo se puede borrar una categoría que no esté en uso. Si tiene sub-categorías o productos
              asignados, el sistema lo va a impedir y te va a decir cuántos son.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Si solo querés que deje de ofrecerse, <strong>desactivala</strong>.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPorBorrar(null)}
                disabled={borrando}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => borrar(porBorrar)}
                disabled={borrando}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {borrando ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {verProductosDe ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-800">
                  Productos de «{verProductosDe.nombre}»
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {cargandoProductos
                    ? "Cargando…"
                    : `${productos.length} ${productos.length === 1 ? "producto" : "productos"}`}
                </p>
              </div>
              <button
                onClick={() => setVerProductosDe(null)}
                aria-label="Cerrar"
                className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="min-h-[6rem] flex-1 overflow-y-auto">
              {cargandoProductos ? (
                <p className="p-6 text-sm text-slate-400">Cargando productos…</p>
              ) : productos.length === 0 ? (
                <p className="p-6 text-sm text-slate-400">
                  Esta categoría todavía no tiene productos. Al cargar o editar un producto, elegí esta
                  categoría como principal.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {productos.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/inventario/${p.id}/editar`}
                        className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-slate-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-800">{p.nombre}</span>
                          <span className="block text-[11px] text-slate-400">
                            SKU {p.sku} · Stock {Number(p.stock_actual) || 0} {p.unidad_medida}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-[#3F8E91]">
                          {fmtGs(p.precio_venta)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-slate-100 px-5 py-3 text-right">
              <button
                onClick={() => setVerProductosDe(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
