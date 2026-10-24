"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Store, Trash2, Truck } from "lucide-react";
import SelectorUnidad from "@/components/inventario/SelectorUnidad";
import MontoInput from "@/components/ui/MontoInput";
import FechaSelect from "@/components/ui/FechaSelect";
import { uploadCompraComprobante } from "@/lib/compras/storage";
import SmartCombobox, { type ComboOption } from "@/components/ui/SmartCombobox";
import { getProveedores, proveedorExiste, createProveedor } from "@/lib/proveedores/storage";
import { getProductos, productoExiste, saveProducto } from "@/lib/inventario/storage";
import { useCamiones } from "@/shared/hooks/useRepartos";
import { formatCantidad } from "@/lib/inventario/unidades";
import type { TipoIva, TipoPago } from "@/lib/compras/types";
import { TIPOS_COMPROBANTE_COMPRA, type TipoComprobanteCompra } from "@/lib/compras/comprobantes";
import type { Proveedor } from "@/lib/proveedores/types";
import type { Producto } from "@/lib/inventario/types";
import type { Compra } from "@/lib/compras/types";
import { getCompraDetalle } from "@/lib/compras/storage";
import { precioSegunLista } from "@/lib/ventas/listas-precio";

/**
 * Nueva compra: varios productos en una lista, y a dónde entra la mercadería —
 * al salón o arriba de un camión (la carga del camión es esto).
 *
 * Sin timbrado, sin cuentas contables y sin asiento: queda el stock y, si es a
 * crédito, la deuda con el proveedor (Cuentas por pagar).
 */

const fmt = (v: number) => `₲ ${Math.round(v).toLocaleString("es-PY")}`;
function genIdemKey(): string {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
/** Máscara del N° de factura: 3-3-7 (001-001-0000001). */
function formatComprobante(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 13);
  let out = d.slice(0, 3);
  if (d.length > 3) out += "-" + d.slice(3, 6);
  if (d.length > 6) out += "-" + d.slice(6, 13);
  return out;
}
/** IVA del producto ("10%", "5%", "EXENTA") al vocabulario de compras. */
function ivaDe(p: Producto): TipoIva {
  const v = (p.tipo_iva ?? "").trim().toUpperCase();
  if (v === "5%" || v === "5") return "5";
  if (v === "EXENTA" || v === "EXENTO" || v === "0" || v === "0%") return "exenta";
  return "10";
}
const IVA_FACTOR: Record<TipoIva, number> = { exenta: 0, "5": 5 / 105, "10": 10 / 110 };

/** Hoy en Paraguay, AAAA-MM-DD. */
function hoyIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
}

/** Fecha (AAAA-MM-DD) + días de plazo → vencimiento propuesto de la factura. */
function sumarDias(fechaIso: string, diasStr: string): string {
  const dias = parseInt(diasStr, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaIso) || !Number.isFinite(dias) || dias <= 0) return "";
  const d = new Date(`${fechaIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Cantidad escrita ("1,5") a número. */
function num(v: string): number {
  return parseFloat(v.replace(",", ".")) || 0;
}

const MAX_COMPROBANTE_MB = 8;
const ALLOWED_COMPROBANTE = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

const INPUT = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40 focus:border-[#4FAEB2] bg-white";
const CELDA = "w-full rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40 bg-white";
const LABEL = "mb-1 block text-xs font-semibold text-slate-500";
const SUBLABEL = "mb-1 block text-[11px] font-medium text-slate-500";

type Linea = {
  producto_id: string;
  nombre: string;
  codigo: string;
  unidad: string;
  cantidad: string;
  /**
   * Cuánto entra ya (al salón o al camión). Sigue a la cantidad hasta que se
   * lo cambia a mano; lo que falta queda pendiente de ingresar.
   */
  ingresa: string;
  ingresaTocado: boolean;
  costo: string;
  iva: TipoIva;
  precio: string;
  /** Categoría principal del producto ("" = sin categoría). */
  categoria: string;
};

type Categoria = { id: string; nombre: string };
const NUEVA_CATEGORIA = "__nueva__";

function Seg<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-slate-200">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`flex-1 py-2 text-xs font-semibold transition-colors ${
            value === o.value ? "bg-[#4FAEB2] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="block h-4 w-1 rounded-full bg-[#4FAEB2]" />
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{children}</h3>
    </div>
  );
}

export default function NuevaCompraModal({
  onClose,
  onSaved,
  editar,
}: {
  onClose: () => void;
  onSaved: () => void;
  /** Editar: se abre con esta compra cargada y al guardar la reemplaza. */
  editar?: Compra;
}) {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const { camiones, mutate: recargarCamiones } = useCamiones();
  const [idempotencyKey] = useState(genIdemKey);

  const [proveedorId, setProveedorId] = useState("");
  /** "" = salón; si no, el id del camión. */
  const [destino, setDestino] = useState("");
  /** "camion" sin camión elegido todavía: se muestra el buscador de camiones. */
  const [tipoDestino, setTipoDestino] = useState<"salon" | "camion">("salon");
  /** Lista con la que va a vender el destino (salón o camión). */
  const [lista, setLista] = useState<"minorista" | "mayorista">("minorista");
  const [listaSalon, setListaSalon] = useState<"minorista" | "mayorista">("minorista");
  function elegirDestino(id: string) {
    setDestino(id);
    if (!id) {
      setLista(listaSalon);
      return;
    }
    const c = camiones.find((x) => x.id === id);
    setLista(c?.lista_precio === "mayorista" ? "mayorista" : "minorista");
  }
  const camionOpts: ComboOption[] = useMemo(
    () => camiones.map((c) => ({ id: c.id, label: nombreCamion(c.alias), sub: c.repartidor ?? "Sin usuario asignado" })),
    [camiones]
  );
  const [numeroComprobante, setNumeroComprobante] = useState("");
  const [tipoComprobante, setTipoComprobante] = useState<TipoComprobanteCompra>("Factura");
  const [generando, setGenerando] = useState(false);

  /** Número interno para este tipo (REM-000001…), cuando el proveedor no da uno. */
  async function generarNumero() {
    setGenerando(true);
    try {
      const r = await fetch(`/api/compras/siguiente-numero?tipo=${encodeURIComponent(tipoComprobante)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await r.json().catch(() => ({}))) as { data?: { numero?: string }; error?: string };
      if (j.data?.numero) setNumeroComprobante(j.data.numero);
      else setErrorSubmit(j.error ?? "No se pudo generar el número.");
    } finally {
      setGenerando(false);
    }
  }
  const [tipoPago, setTipoPago] = useState<TipoPago>("contado");
  const [plazoDias, setPlazoDias] = useState("");
  const [fechaCompra, setFechaCompra] = useState(hoyIso());
  /** Vencimiento de la factura: se propone con fecha + plazo hasta que se lo toca. */
  const [vencimiento, setVencimiento] = useState("");
  const [vencimientoTocado, setVencimientoTocado] = useState(false);
  /** Camión que trajo la mercadería cuando entra al salón ("" = ninguno). */
  const [transporte, setTransporte] = useState("");
  useEffect(() => {
    if (vencimientoTocado) return;
    setVencimiento(tipoPago === "credito" ? sumarDias(fechaCompra, plazoDias) : "");
  }, [fechaCompra, plazoDias, tipoPago, vencimientoTocado]);
  const [lineas, setLineas] = useState<Linea[]>([]);

  // Editar: cuando están los productos y los camiones, se carga la compra.
  const [precargada, setPrecargada] = useState(!editar);
  useEffect(() => {
    if (!editar || precargada || productos.length === 0) return;
    let cancel = false;
    void getCompraDetalle(editar.id).then((d) => {
      if (cancel) return;
      setProveedorId(String(editar.proveedor_id ?? ""));
      if (editar.numero_comprobante) setNumeroComprobante(editar.numero_comprobante);
      if (editar.tipo_comprobante && TIPOS_COMPROBANTE_COMPRA.some((t) => t.valor === editar.tipo_comprobante)) {
        setTipoComprobante(editar.tipo_comprobante as TipoComprobanteCompra);
      }
      setTipoPago(editar.tipo_pago === "credito" ? "credito" : "contado");
      if (editar.plazo_dias) setPlazoDias(String(editar.plazo_dias));
      if (editar.fecha) {
        setFechaCompra(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date(editar.fecha)));
      }
      if (d?.fecha_vencimiento) {
        setVencimiento(d.fecha_vencimiento);
        setVencimientoTocado(true);
      }
      if (d?.camion_transporte_id && !d.destino_camion_id) setTransporte(d.camion_transporte_id);
      if (d?.destino_camion_id) {
        setTipoDestino("camion");
        elegirDestino(d.destino_camion_id);
      }
      const items = d?.items?.length
        ? d.items
        : [{ producto_id: editar.producto_id, producto_nombre: editar.producto_nombre, cantidad: editar.cantidad,
             cantidad_ingresada: editar.cantidad, costo_unitario: editar.costo_unitario, iva_tipo: editar.iva_tipo,
             total_linea: editar.total }];
      setLineas(
        items
          .filter((it) => it.producto_id)
          .map((it) => {
            const p = productos.find((x) => x.id === it.producto_id);
            const iva = it.iva_tipo === "5" || it.iva_tipo === "exenta" ? it.iva_tipo : "10";
            return {
              producto_id: String(it.producto_id),
              nombre: p?.nombre ?? it.producto_nombre,
              codigo: p?.sku ?? "",
              unidad: p?.unidad_medida ?? "",
              cantidad: String(it.cantidad),
              ingresa: String(it.cantidad_ingresada ?? it.cantidad),
              ingresaTocado: Number(it.cantidad_ingresada ?? it.cantidad) !== Number(it.cantidad),
              costo: String(Math.round(Number(it.costo_unitario) || 0)),
              iva: iva as TipoIva,
              precio: p && p.precio_venta > 0 ? String(Math.round(p.precio_venta)) : "",
              categoria: p?.categoria_principal_id ?? "",
            };
          })
      );
      setPrecargada(true);
    });
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editar, precargada, productos, camiones]);

  // Foto/PDF de la factura (se sube después de crear la compra).
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errArchivo, setErrArchivo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [errorSubmit, setErrorSubmit] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Inline: proveedor
  const [nvProv, setNvProv] = useState(false);
  const [fProv, setFProv] = useState({ nombre: "", ruc: "", telefono: "", email: "", contacto: "" });
  const [errRuc, setErrRuc] = useState<string | null>(null);
  // Inline: producto
  const [nvProd, setNvProd] = useState(false);
  const [fProd, setFProd] = useState({ nombre: "", sku: "", unidad_medida: "Unidad", stock_minimo: "0", categoria: "" });
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  async function recargarCategorias() {
    try {
      const r = await fetch("/api/inventario/categorias", { credentials: "include", cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { data?: { categorias?: Categoria[] } };
      setCategorias(j.data?.categorias ?? []);
    } catch {
      // Sin categorías la compra igual se puede cargar.
    }
  }

  /** Crea una categoría desde la compra y la devuelve (o null si se canceló). */
  async function crearCategoria(): Promise<string | null> {
    const nombre = window.prompt("Nombre de la nueva categoría:")?.trim();
    if (!nombre) return null;
    const r = await fetch("/api/inventario/categorias", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre }),
    });
    const j = (await r.json().catch(() => ({}))) as { data?: { categoria?: Categoria }; error?: string };
    if (!r.ok || !j.data?.categoria) {
      setErrorSubmit(j.error ?? "No se pudo crear la categoría.");
      return null;
    }
    await recargarCategorias();
    return j.data.categoria.id;
  }
  const [errSku, setErrSku] = useState<string | null>(null);

  async function recargarProveedores() {
    const d = await getProveedores();
    setProveedores(d.filter((p) => p.estado === "activo"));
  }
  const recargarProductos = () => getProductos().then(setProductos);

  useEffect(() => {
    recargarProveedores();
    recargarProductos();
    recargarCategorias();
    // Con qué lista vende hoy el salón: es el destino que viene elegido.
    fetch("/api/compras/lista-salon", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j: { data?: { lista?: string } }) => {
        const l = j.data?.lista === "mayorista" ? "mayorista" : "minorista";
        setListaSalon(l);
        setLista((prev) => (destino ? prev : l));
      })
      .catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const provOpts: ComboOption[] = useMemo(
    () => proveedores.map((p) => ({ id: p.id, label: p.nombre, sub: p.ruc ? `RUC ${p.ruc}` : null })), [proveedores]);

  // ── Lista de productos ──
  function agregar(p: Producto) {
    setErrorSubmit(null);
    const ya = lineas.findIndex((l) => l.producto_id === p.id);
    if (ya === -1) {
      setLineas((prev) => [
        ...prev,
        {
          producto_id: p.id,
          nombre: p.nombre,
          codigo: p.sku,
          unidad: p.unidad_medida,
          cantidad: "1",
          ingresa: "1",
          ingresaTocado: false,
          costo: p.costo_promedio > 0 ? String(Math.round(p.costo_promedio)) : "",
          iva: ivaDe(p),
          precio: p.precio_venta > 0 ? String(Math.round(p.precio_venta)) : "",
          categoria: p.categoria_principal_id ?? "",
        },
      ]);
    }
    // El cursor va a la cantidad de ese renglón: se escribe y se sigue.
    const idx = ya === -1 ? lineas.length : ya;
    requestAnimationFrame(() => {
      const el = document.getElementById(`compra-cant-${idx}`) as HTMLInputElement | null;
      el?.focus();
      el?.select();
    });
  }
  function cambiar(i: number, patch: Partial<Linea>) {
    setLineas((prev) =>
      prev.map((l, j) => {
        if (j !== i) return l;
        const n = { ...l, ...patch };
        // Mientras no se tocó "ingresa", entra todo lo comprado.
        if (patch.cantidad !== undefined && !n.ingresaTocado) n.ingresa = patch.cantidad;
        return n;
      })
    );
  }
  function quitar(i: number) {
    setLineas((prev) => prev.filter((_, j) => j !== i));
  }

  const calc = lineas.map((l) => {
    const cantidad = num(l.cantidad);
    const ingresa = Math.min(cantidad, Math.max(0, num(l.ingresa)));
    const costo = parseFloat(l.costo) || 0;
    const total = cantidad * costo;
    const iva = Math.round(total * IVA_FACTOR[l.iva]);
    return { cantidad, ingresa, pendiente: cantidad - ingresa, costo, total, iva, precio: parseFloat(l.precio) || 0 };
  });
  const hayPendiente = calc.some((c) => c.pendiente > 1e-9);
  const total = calc.reduce((s, c) => s + c.total, 0);
  const montoIva = calc.reduce((s, c) => s + c.iva, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorSubmit(null);
    const proveedor = proveedores.find((p) => String(p.id) === proveedorId);
    if (!proveedor) return setErrorSubmit("Elegí el proveedor.");
    if (tipoDestino === "camion" && !destino) return setErrorSubmit("Elegí a qué camión va la mercadería.");
    if (lineas.length === 0) return setErrorSubmit("Agregá al menos un producto.");
    for (const [i, c] of calc.entries()) {
      if (c.cantidad <= 0) return setErrorSubmit(`${lineas[i].nombre}: la cantidad tiene que ser mayor a 0.`);
      if (c.costo <= 0) return setErrorSubmit(`${lineas[i].nombre}: poné el costo.`);
      if (num(lineas[i].ingresa) > c.cantidad + 1e-9) {
        return setErrorSubmit(`${lineas[i].nombre}: no puede ingresar más de lo comprado.`);
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaCompra)) return setErrorSubmit("Poné la fecha de compra.");

    setSubmitting(true);
    try {
      const r = await fetch("/api/compras", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sin_asiento: true,
          origen_compra: "directa",
          idempotency_key: idempotencyKey,
          reemplaza_compra_id: editar?.id ?? null,
          proveedor_id: String(proveedor.id),
          proveedor_nombre: proveedor.nombre,
          destino_camion_id: destino || null,
          lista_precio: lista,
          moneda: "PYG",
          tipo_cambio: 1,
          tipo_pago: tipoPago,
          plazo_dias: tipoPago === "credito" && plazoDias ? parseInt(plazoDias, 10) : null,
          cuotas: tipoPago === "credito" ? 1 : null,
          numero_comprobante: numeroComprobante.trim() || null,
          tipo_comprobante: tipoComprobante,
          fecha: fechaCompra,
          fecha_vencimiento: vencimiento || null,
          camion_transporte_id: !destino && transporte ? transporte : null,
          items: lineas.map((l, i) => ({
            producto_id: l.producto_id,
            producto_nombre: l.nombre,
            cantidad: calc[i].cantidad,
            cantidad_ingresada: calc[i].ingresa,
            costo_unitario: calc[i].costo,
            iva_tipo: l.iva,
            precio_venta: calc[i].precio > 0 ? calc[i].precio : null,
            categoria_id: l.categoria || null,
          })),
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string; data?: { compra?: { id: string } } };
      if (!r.ok || !j.success || !j.data?.compra) {
        setErrorSubmit(j.error ?? `No se pudo guardar la compra (${r.status}).`);
        return;
      }

      // La lista del camión pudo cambiar con esta compra.
      if (destino) void recargarCamiones();

      // Foto/PDF de la factura (best-effort: la compra ya quedó guardada).
      if (archivo) {
        const up = await uploadCompraComprobante(j.data.compra.id, archivo);
        if (!up.ok) {
          alert(`La compra se guardó, pero no se pudo adjuntar el comprobante: ${up.error}. Podés volver a adjuntarlo desde el detalle.`);
        }
      }
      onSaved();
    } catch (err) {
      setErrorSubmit(err instanceof Error ? err.message : "Error de red.");
    } finally {
      setSubmitting(false);
    }
  }

  function elegirArchivo(f: File | null) {
    setErrArchivo(null);
    if (!f) { setArchivo(null); return; }
    if (!ALLOWED_COMPROBANTE.has(f.type)) { setErrArchivo("Formato no permitido. Usá JPG, PNG, WebP o PDF."); return; }
    if (f.size > MAX_COMPROBANTE_MB * 1024 * 1024) { setErrArchivo(`El archivo supera ${MAX_COMPROBANTE_MB} MB.`); return; }
    setArchivo(f);
  }

  async function agregarProveedor() {
    if (!fProv.nombre.trim() || !fProv.ruc.trim()) return;
    setErrRuc(null);
    const dup = await proveedorExiste(fProv.ruc);
    if (dup) { setErrRuc(`RUC ya registrado para "${dup.nombre}".`); return; }
    const r = await createProveedor({
      nombre: fProv.nombre.trim().toUpperCase(), ruc: fProv.ruc.trim(), telefono: fProv.telefono.trim(),
      email: fProv.email.trim(), contacto: fProv.contacto.trim().toUpperCase(), direccion: "", estado: "activo",
    });
    if (!r.ok) { setErrRuc(r.error); return; }
    await recargarProveedores();
    setProveedorId(String(r.proveedor.id));
    setNvProv(false);
    setFProv({ nombre: "", ruc: "", telefono: "", email: "", contacto: "" });
  }

  async function agregarProducto() {
    if (!fProd.nombre.trim() || !fProd.sku.trim()) return;
    setErrSku(null);
    const dup = await productoExiste(fProd.sku, fProd.nombre);
    if (dup) { setErrSku(`Ya existe un producto con ese SKU o nombre ("${dup.nombre}" — ${dup.sku}).`); return; }
    const creado = await saveProducto({
      nombre: fProd.nombre.trim().toUpperCase(), sku: fProd.sku.trim().toUpperCase(),
      unidad_medida: fProd.unidad_medida.toUpperCase(), metodo_valuacion: "CPP",
      stock_actual: 0, stock_minimo: parseInt(fProd.stock_minimo) || 0,
      categoria_principal_id: fProd.categoria || null,
      costo_promedio: 0, precio_venta: 0,
    });
    if (!creado) return;
    await recargarProductos();
    agregar(creado);
    setNvProd(false);
    setFProd({ nombre: "", sku: "", unidad_medida: "Unidad", stock_minimo: "0", categoria: "" });
  }

  const destinoTexto = destino
    ? `al camión ${camiones.find((c) => c.id === destino)?.alias ?? ""}`
    : "al salón";

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-900/60 px-0 pt-0 backdrop-blur-sm sm:px-4 sm:pt-8" onClick={onClose}>
      <form onSubmit={handleSubmit}
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-6xl flex-col rounded-none border-0 bg-white shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:rounded-2xl sm:border"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Operaciones · Compras</p>
            </div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
              {editar ? `Editar compra ${editar.numero_control}` : "Nueva compra"}
            </h2>
            {editar ? (
              <p className="mt-0.5 text-xs text-slate-500">
                Al guardar, {editar.numero_control} queda anulada y se registra la compra corregida con un número nuevo.
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">✕</button>
        </div>

        {/* Cuerpo */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">

          {/* Proveedor y destino */}
          <section className="space-y-3">
            <Titulo>Proveedor y destino</Titulo>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL}>Proveedor <span className="text-red-500">*</span></label>
                <SmartCombobox options={provOpts} value={proveedorId || null}
                  onChange={(id) => setProveedorId(id ?? "")} placeholder="Seleccionar proveedor…" />
                {!nvProv ? (
                  <button type="button" onClick={() => setNvProv(true)}
                    className="mt-1.5 text-[11px] text-slate-400 underline underline-offset-2 transition-colors hover:text-[#3F8E91]">
                    ¿No encontrás el proveedor? Crear nuevo
                  </button>
                ) : null}
              </div>
              <div>
                <label className={LABEL}>Comprobante (opcional)</label>
                <div className="flex gap-2">
                  <select value={tipoComprobante}
                    onChange={(e) => { setTipoComprobante(e.target.value as TipoComprobanteCompra); setNumeroComprobante(""); }}
                    aria-label="Tipo de comprobante"
                    className="w-40 shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40">
                    {TIPOS_COMPROBANTE_COMPRA.map((t) => <option key={t.valor} value={t.valor}>{t.valor}</option>)}
                  </select>
                  <input value={numeroComprobante}
                    onChange={(e) => {
                      const v = e.target.value;
                      // La máscara 001-001-0000001 solo para una factura tipeada a mano.
                      setNumeroComprobante(/factura/i.test(tipoComprobante) && !/[a-z]/i.test(v) ? formatComprobante(v) : v.toUpperCase());
                    }}
                    placeholder={/factura/i.test(tipoComprobante) ? "001-001-0000001" : "N°"}
                    aria-label={`N° de ${tipoComprobante.toLowerCase()}`}
                    className={`${INPUT} min-w-0`} />
                  <button type="button" onClick={generarNumero} disabled={generando}
                    className="shrink-0 rounded-lg border border-[#4FAEB2] px-3 text-xs font-semibold text-[#3F8E91] transition-colors hover:bg-[#4FAEB2]/10 disabled:opacity-40">
                    {generando ? "…" : "Generar"}
                  </button>
                </div>
              </div>
            </div>

            {nvProv && (
              <InlineBox titulo="Nuevo proveedor" onCancel={() => { setNvProv(false); setErrRuc(null); }}
                onSave={agregarProveedor} saveDisabled={!fProv.nombre.trim() || !fProv.ruc.trim()}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div><label className={SUBLABEL}>Nombre / Razón social *</label>
                    <input value={fProv.nombre} onChange={(e) => setFProv((p) => ({ ...p, nombre: e.target.value.toUpperCase() }))}
                      placeholder="Ej: TEXTILES DEL SUR S.A." className={`${INPUT} uppercase`} /></div>
                  <div><label className={SUBLABEL}>RUC *</label>
                    <input value={fProv.ruc} onChange={(e) => { setErrRuc(null); setFProv((p) => ({ ...p, ruc: e.target.value })); }}
                      placeholder="Ej: 80012345-1" className={`${INPUT} ${errRuc ? "border-red-300 bg-red-50" : ""}`} />
                    {errRuc && <p className="mt-1 text-[11px] text-red-600">{errRuc}</p>}</div>
                  <div><label className={SUBLABEL}>Teléfono</label>
                    <input value={fProv.telefono} onChange={(e) => setFProv((p) => ({ ...p, telefono: e.target.value }))}
                      placeholder="Ej: 0981 111 222" className={INPUT} /></div>
                  <div><label className={SUBLABEL}>Email</label>
                    <input value={fProv.email} onChange={(e) => setFProv((p) => ({ ...p, email: e.target.value.toLowerCase() }))}
                      placeholder="Ej: ventas@empresa.com" className={INPUT} /></div>
                </div>
              </InlineBox>
            )}

            <div>
              <label className={LABEL}>¿A dónde va la mercadería?</label>
              {/* items-start: el buscador abierto crece hacia abajo sin estirar
                  los botones de al lado. */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div className="flex shrink-0 gap-2">
                  <DestinoBoton activo={tipoDestino === "salon"}
                    onClick={() => { setTipoDestino("salon"); elegirDestino(""); }}
                    icono={<Store className="h-4 w-4" />} titulo="Salón" />
                  <DestinoBoton activo={tipoDestino === "camion"}
                    onClick={() => setTipoDestino("camion")}
                    icono={<Truck className="h-4 w-4" />} titulo="Camión" />
                </div>
                {tipoDestino === "camion" ? (
                  <div className="min-w-0 flex-1">
                    {/* Buscador: con muchos camiones, un botón por camión no entra. */}
                    <SmartCombobox options={camionOpts} value={destino || null} allowClear={false}
                      onChange={(id) => elegirDestino(id ?? "")}
                      placeholder={camiones.length === 0 ? "No hay camiones activos" : "Elegí el camión…"} />
                  </div>
                ) : null}
              </div>
              <div className="mt-3 max-w-sm">
                <label className={SUBLABEL}>
                  {tipoDestino === "camion" ? "El camión vende con precio" : "El salón vende con precio"}
                </label>
                <Seg<"minorista" | "mayorista"> value={lista}
                  options={[{ value: "minorista", label: "Minorista" }, { value: "mayorista", label: "Mayorista (−10%)" }]}
                  onChange={setLista} />
                <p className="mt-1 text-[11px] text-slate-400">
                  {lista === "mayorista"
                    ? `La caja ${tipoDestino === "camion" ? "del camión" : "del salón"} cobra el precio de venta con 10% de descuento (lo ves abajo, en cada producto). Vale para todo lo que venda, no solo esta compra.`
                    : "La caja vende con esta lista; no se elige al vender."}
                </p>
              </div>
            </div>
          </section>

          {/* Datos de la factura */}
          <section className="space-y-3">
            <Titulo>Datos de la factura</Titulo>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={LABEL}>Fecha de compra <span className="text-red-500">*</span></label>
                <FechaSelect value={fechaCompra} onChange={(e) => setFechaCompra(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Vencimiento de la factura</label>
                <FechaSelect value={vencimiento}
                  onChange={(e) => { setVencimiento(e.target.value); setVencimientoTocado(true); }}
                  className={INPUT} />
                <p className="mt-1 text-[11px] text-slate-400">
                  {tipoPago === "credito" ? "Se calcula con el plazo; podés cambiarla." : "Opcional en compras al contado."}
                </p>
              </div>
              <div>
                <label className={LABEL}>Camión que la trajo</label>
                {tipoDestino === "camion" ? (
                  <p className="flex h-[38px] items-center rounded-lg border border-slate-100 bg-slate-50 px-3 text-sm text-slate-500">
                    {destino ? nombreCamion(camiones.find((c) => c.id === destino)?.alias ?? "") : "El camión de destino"}
                  </p>
                ) : (
                  <SmartCombobox options={camionOpts} value={transporte || null}
                    onChange={(id) => setTransporte(id ?? "")}
                    placeholder={camiones.length === 0 ? "No hay camiones" : "Ninguno / proveedor"} />
                )}
              </div>
            </div>
          </section>

          {/* Productos */}
          <section className="space-y-3">
            <Titulo>Productos</Titulo>
            <BuscadorProducto productos={productos} onElegir={agregar} />
            {!nvProd ? (
              <button type="button" onClick={() => setNvProd(true)}
                className="text-[11px] text-slate-400 underline underline-offset-2 transition-colors hover:text-[#3F8E91]">
                ¿No encontrás el producto? Crear nuevo
              </button>
            ) : (
              <InlineBox titulo="Nuevo producto" onCancel={() => { setNvProd(false); setErrSku(null); }}
                onSave={agregarProducto} saveDisabled={!fProd.nombre.trim() || !fProd.sku.trim()}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div><label className={SUBLABEL}>Nombre *</label>
                    <input value={fProd.nombre} onChange={(e) => setFProd((p) => ({ ...p, nombre: e.target.value.toUpperCase() }))}
                      placeholder="Ej: ACEITE NATURA 900 ML" className={`${INPUT} uppercase`} /></div>
                  <div><label className={SUBLABEL}>SKU / Código *</label>
                    <input value={fProd.sku} onChange={(e) => { setErrSku(null); setFProd((p) => ({ ...p, sku: e.target.value.toUpperCase() })); }}
                      placeholder="Ej: 1001" className={`${INPUT} uppercase ${errSku ? "border-red-300 bg-red-50" : ""}`} />
                    {errSku && <p className="mt-1 text-[11px] text-red-600">{errSku}</p>}</div>
                  <div><label className={SUBLABEL}>Unidad de medida</label>
                    <SelectorUnidad
                      value={fProd.unidad_medida}
                      onChange={(unidad_medida) => setFProd((p) => ({ ...p, unidad_medida }))}
                      className={INPUT}
                    /></div>
                  <div><label className={SUBLABEL}>Stock mínimo</label>
                    <input type="number" min={0} value={fProd.stock_minimo}
                      onChange={(e) => setFProd((p) => ({ ...p, stock_minimo: e.target.value }))} placeholder="Ej: 5" className={INPUT} /></div>
                  <div><label className={SUBLABEL}>Categoría</label>
                    <SelectorCategoria value={fProd.categoria} categorias={categorias}
                      onChange={async (v) => {
                        if (v === NUEVA_CATEGORIA) {
                          const id = await crearCategoria();
                          if (id) setFProd((p) => ({ ...p, categoria: id }));
                        } else setFProd((p) => ({ ...p, categoria: v }));
                      }}
                      className={INPUT} /></div>
                </div>
                <p className="text-[11px] text-slate-400">Se agrega a la lista; el costo y el precio se cargan ahí.</p>
              </InlineBox>
            )}

            {lineas.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
                Buscá un producto (o escaneá el código) y se agrega a la lista.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[1040px] text-sm">
                  <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="min-w-[200px] px-3 py-2 text-left">Producto</th>
                      <th className="w-24 px-2 py-2 text-right">Comprada</th>
                      <th className="w-24 px-2 py-2 text-right" title={`Lo que entra ya ${destinoTexto}`}>
                        {tipoDestino === "camion" ? "Ingresa" : "Ingresa al salón"}
                      </th>
                      <th className="w-20 px-2 py-2 text-right">Pendiente</th>
                      <th className="w-32 px-2 py-2 text-right">Costo unit.</th>
                      <th className="w-32 px-2 py-2 text-right">
                        {lista === "mayorista" ? "Precio venta (base)" : "Precio venta"}
                      </th>
                      <th className="w-40 px-2 py-2 text-left">Categoría</th>
                      <th className="w-28 px-3 py-2 text-right">Total</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lineas.map((l, i) => (
                      <tr key={l.producto_id}>
                        <td className="px-3 py-2">
                          <span className="block font-medium text-slate-900">{l.nombre}</span>
                          <span className="block text-[11px] text-slate-400">
                            {l.codigo ? `Cód. ${l.codigo} · ` : ""}{l.unidad}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <input id={`compra-cant-${i}`} inputMode="decimal" value={l.cantidad}
                            onChange={(e) => cambiar(i, { cantidad: e.target.value })}
                            aria-label={`Cantidad de ${l.nombre}`} className={CELDA} />
                        </td>
                        <td className="px-2 py-2">
                          <input inputMode="decimal" value={l.ingresa}
                            onChange={(e) => cambiar(i, { ingresa: e.target.value, ingresaTocado: true })}
                            aria-label={`Cantidad que ingresa de ${l.nombre}`}
                            className={`${CELDA} ${num(l.ingresa) > calc[i].cantidad + 1e-9 ? "border-red-300 bg-red-50" : ""}`} />
                        </td>
                        <td className={`px-2 py-2 text-right tabular-nums ${calc[i].pendiente > 1e-9 ? "font-semibold text-amber-600" : "text-slate-300"}`}>
                          {calc[i].pendiente > 1e-9 ? formatCantidad(calc[i].pendiente, l.unidad) : "—"}
                        </td>
                        <td className="px-2 py-2">
                          <MontoInput value={l.costo} onChange={(n) => cambiar(i, { costo: String(n) })}
                            decimals={false} placeholder="0" aria-label={`Costo de ${l.nombre}`} className={CELDA} />
                        </td>
                        <td className="px-2 py-2">
                          <MontoInput value={l.precio} onChange={(n) => cambiar(i, { precio: String(n) })}
                            decimals={false} placeholder="—" aria-label={`Precio de venta de ${l.nombre}`} className={CELDA} />
                          {/* Con mayorista la caja cobra el 10% menos que este precio: se muestra
                              acá para que se vea el precio real de venta. */}
                          {lista === "mayorista" && calc[i].precio > 0 ? (
                            <span className="mt-0.5 block text-right text-[11px] font-semibold text-[#3F8E91]">
                              Mayorista: {fmt(precioSegunLista(calc[i].precio, "mayorista"))}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2">
                          <SelectorCategoria value={l.categoria} categorias={categorias}
                            onChange={async (v) => {
                              if (v === NUEVA_CATEGORIA) {
                                const id = await crearCategoria();
                                if (id) cambiar(i, { categoria: id });
                              } else cambiar(i, { categoria: v });
                            }}
                            aria-label={`Categoría de ${l.nombre}`}
                            className="w-full rounded-lg border border-slate-200 bg-white px-1.5 py-1.5 text-sm" />
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                          {fmt(calc[i].total)}
                        </td>
                        <td className="px-1 py-2 text-center">
                          <button type="button" onClick={() => quitar(i)} aria-label={`Quitar ${l.nombre}`}
                            className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-slate-400">
              El costo es con IVA incluido (el IVA es el del producto). El precio de venta y la categoría, si los ponés, quedan en el producto (Inventario).
              {" "}Si no llegó todo, bajá «Ingresa»: lo que falta queda pendiente y se ingresa después desde el detalle de la compra.
            </p>
            {hayPendiente ? (
              <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
                Queda mercadería pendiente de ingresar: solo entra al stock lo que pusiste en «Ingresa».
              </p>
            ) : null}
          </section>

          {/* Pago y factura */}
          <section className="space-y-3">
            <Titulo>Pago</Titulo>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL}>Condición</label>
                <Seg<TipoPago> value={tipoPago}
                  options={[{ value: "contado", label: "Contado" }, { value: "credito", label: "Crédito" }]}
                  onChange={setTipoPago} />
                {tipoPago === "credito" && (
                  <div className="mt-2">
                    <label className={SUBLABEL}>Plazo en días</label>
                    <input inputMode="numeric" value={plazoDias}
                      onChange={(e) => setPlazoDias(e.target.value.replace(/\D/g, ""))}
                      placeholder="Ej: 30" className={INPUT} />
                  </div>
                )}
              </div>
              <div>
                <label className={LABEL}>Foto de la factura (opcional)</label>
                {!archivo ? (
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm font-semibold text-[#3F8E91] transition-colors hover:bg-[#4FAEB2]/5">
                    <span className="text-base leading-none">📎</span> Adjuntar foto o PDF
                  </button>
                ) : (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <span className="truncate text-slate-700">📄 {archivo.name}</span>
                    <button type="button" onClick={() => { setArchivo(null); if (fileRef.current) fileRef.current.value = ""; }}
                      className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Quitar</button>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
                  onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)} />
                {errArchivo && <p className="mt-1 text-[11px] text-red-600">{errArchivo}</p>}
              </div>
            </div>
          </section>
        </div>

        {/* Pie con totales */}
        <div className="border-t border-slate-100 px-5 py-4">
          {errorSubmit ? (
            <p role="alert" className="mb-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{errorSubmit}</p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-500">
              {lineas.length} {lineas.length === 1 ? "producto" : "productos"} · IVA incluido {fmt(montoIva)}
              <span className="block text-xl font-bold tabular-nums text-slate-900">{fmt(total)}</span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="h-11 rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100">
                Cancelar
              </button>
              <button type="submit" disabled={submitting}
                className="h-11 rounded-lg bg-[#4FAEB2] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#3F8E91] disabled:opacity-40">
                {submitting ? "Guardando…" : editar ? "Guardar cambios" : `Guardar compra ${destinoTexto}`}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

function DestinoBoton({ activo, onClick, icono, titulo }: {
  activo: boolean; onClick: () => void; icono: React.ReactNode; titulo: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activo}
      className={`flex h-10 items-center gap-2 rounded-lg border-2 px-4 text-sm font-semibold transition-colors ${
        activo ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
      <span className={activo ? "text-[#3F8E91]" : "text-slate-400"}>{icono}</span>
      {titulo}
    </button>
  );
}

/** "Camion 1" ya dice camión; "01" no: se le agrega para que se entienda. */
function nombreCamion(alias: string): string {
  const sinTilde = alias.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return sinTilde.startsWith("camion") ? alias : `Camión ${alias}`;
}

/**
 * Buscador para sumar productos a la compra: por nombre, SKU o código de
 * barras. Enter agrega el marcado (flechas para moverse); un código exacto
 * —lo que manda el lector— se agrega directo.
 */
function BuscadorProducto({ productos, onElegir }: { productos: Producto[]; onElegir: (p: Producto) => void }) {
  const [q, setQ] = useState("");
  const [marcado, setMarcado] = useState(0);
  const [abierto, setAbierto] = useState(false);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return productos
      .filter((p) =>
        p.nombre.toLowerCase().includes(t) ||
        p.sku.toLowerCase().includes(t) ||
        (p.codigo_barras ?? "").toLowerCase().includes(t))
      .slice(0, 8);
  }, [productos, q]);

  function elegir(p: Producto) {
    onElegir(p);
    setQ("");
    setMarcado(0);
    setAbierto(false);
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
      <input
        value={q}
        autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setMarcado(0); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setMarcado((i) => (e.key === "ArrowDown" ? Math.min(i + 1, filtrados.length - 1) : Math.max(i - 1, 0)));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const t = q.trim();
            const exacto = productos.find((p) => (p.codigo_barras ?? "").trim() === t || p.sku.trim().toLowerCase() === t.toLowerCase());
            const p = exacto ?? filtrados[marcado];
            if (p) elegir(p);
          } else if (e.key === "Escape") {
            setQ("");
          }
        }}
        placeholder="Buscar producto por nombre, SKU o código de barras para agregarlo…"
        className={`${INPUT} pl-9`}
      />
      {abierto && filtrados.length > 0 ? (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {filtrados.map((p, i) => (
            <li key={p.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(p)}
                onMouseEnter={() => setMarcado(i)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left ${i === marcado ? "bg-[#4FAEB2]/10" : ""}`}>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-slate-900">{p.nombre}</span>
                  <span className="block text-[11px] text-slate-400">{p.sku}</span>
                </span>
                <span className="shrink-0 text-[11px] text-slate-500">
                  stock {formatCantidad(p.stock_actual, p.unidad_medida)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function InlineBox({ titulo, children, onSave, onCancel, saveDisabled }: {
  titulo: string; children: React.ReactNode; onSave: () => void; onCancel: () => void; saveDisabled: boolean;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      {children}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onSave} disabled={saveDisabled}
          className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:opacity-40">
          Guardar {titulo.toLowerCase()}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50">
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Categorías de producto, con "sin categoría" y "+ nueva" al final. */
function SelectorCategoria({ value, categorias, onChange, className, ...rest }: {
  value: string;
  categorias: Categoria[];
  onChange: (v: string) => void;
  className: string;
  "aria-label"?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className} {...rest}>
      <option value="">Sin categoría</option>
      {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      <option value={NUEVA_CATEGORIA}>+ Nueva categoría…</option>
    </select>
  );
}
