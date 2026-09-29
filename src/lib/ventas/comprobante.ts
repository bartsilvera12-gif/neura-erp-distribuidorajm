import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { formatCantidad } from "@/lib/inventario/unidades";
import type { Venta } from "@/lib/ventas/types";

/**
 * Datos del emisor que van en la cabecera del comprobante.
 *
 * Salen de la configuración de autoimpresor (Configuración → Facturación), que
 * es donde ya vivían el RUC y el timbrado. No se inventan.
 */
export interface EmisorComprobante {
  activo: boolean;
  ruc: string | null;
  razon_social: string | null;
  nombre_fantasia: string | null;
  direccion: string | null;
  telefono: string | null;
  actividad_economica?: string | null;
  departamento?: string | null;
  ciudad?: string | null;
  email?: string | null;
  timbrado_numero: string | null;
  timbrado_inicio_vigencia: string | null;
  timbrado_fin_vigencia: string | null;
  establecimiento: string | null;
  punto_expedicion: string | null;
  leyenda: string | null;
}

/**
 * `true` cuando el comprobante puede llamarse FACTURA.
 *
 * Sin timbrado no es una factura: es un comprobante interno de la venta.
 * Titularlo "FACTURA" igual sería escribir en un papel algo que ante la SET no
 * lo es, así que el título cambia según lo que haya configurado.
 */
export function esFacturaLegal(e: EmisorComprobante | null): boolean {
  return !!(e && e.activo && e.ruc && e.timbrado_numero);
}

export async function getEmisorComprobante(): Promise<EmisorComprobante | null> {
  try {
    const res = await fetchWithSupabaseSession("/api/configuracion/autoimpresor", {
      cache: "no-store",
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { autoimpresor?: Record<string, unknown> };
    };
    if (!res.ok || !json.success || !json.data?.autoimpresor) return null;
    const a = json.data.autoimpresor;
    const txt = (v: unknown) => (v == null || v === "" ? null : String(v));
    return {
      activo: a.activo === true,
      ruc: txt(a.ruc_emisor),
      razon_social: txt(a.razon_social_emisor),
      nombre_fantasia: txt(a.nombre_fantasia),
      direccion: txt(a.direccion_matriz),
      telefono: txt(a.telefono),
      actividad_economica: txt(a.actividad_economica),
      departamento: txt(a.departamento),
      ciudad: txt(a.ciudad),
      email: txt(a.email),
      timbrado_numero: txt(a.timbrado_numero),
      timbrado_inicio_vigencia: txt(a.timbrado_inicio_vigencia),
      timbrado_fin_vigencia: txt(a.timbrado_fin_vigencia),
      establecimiento: txt(a.establecimiento_codigo),
      punto_expedicion: txt(a.punto_expedicion_codigo),
      leyenda: txt(a.leyenda_papel_termico),
    };
  } catch {
    return null;
  }
}

export function gs(valor: number): string {
  return `Gs. ${Math.round(valor).toLocaleString("es-PY")}`;
}

/** Fecha y hora del comprobante, en hora de Paraguay. */
export function fechaHora(iso: string): { fecha: string; hora: string } {
  const d = new Date(iso);
  return {
    fecha: d.toLocaleDateString("es-PY", { timeZone: "America/Asuncion" }),
    hora: d.toLocaleTimeString("es-PY", {
      timeZone: "America/Asuncion",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

export interface DatosComprobante {
  venta: Venta;
  emisor: EmisorComprobante | null;
  cliente: string;
  /** RUC o documento del cliente, si lo tiene. */
  clienteRuc?: string | null;
  clienteDireccion?: string | null;
  /** "Efectivo", "A crédito", … tal como se cobró. */
  formaPago: string;
  /** Unidad de medida por producto, para que 1,5 no se lea como 1,5 unidades. */
  unidades?: Record<string, string>;
}

/**
 * El comprobante en texto plano, que es lo que viaja por WhatsApp.
 *
 * Se escribe con las mismas cifras que la pantalla y no recalcula nada: si el
 * mensaje que recibe el cliente dijera otro total que el papel, el que reclama
 * tiene razón y no hay forma de saber cuál de los dos estaba bien.
 */
export function comprobanteEnTexto(d: DatosComprobante): string {
  const { fecha, hora } = fechaHora(d.venta.fecha);
  const titulo = esFacturaLegal(d.emisor) ? "FACTURA" : "COMPROBANTE DE VENTA";
  const nombre = d.emisor?.nombre_fantasia ?? d.emisor?.razon_social ?? "";

  const lineas: string[] = [];
  if (nombre) lineas.push(`*${nombre}*`);
  if (d.emisor?.ruc) lineas.push(`RUC: ${d.emisor.ruc}`);
  lineas.push(`*${titulo}* N.° ${d.venta.numero_control}`);
  if (esFacturaLegal(d.emisor)) lineas.push(`Timbrado N.°: ${d.emisor!.timbrado_numero}`);
  lineas.push(`${fecha} ${hora}`);
  lineas.push(`Cliente: ${d.cliente}`);
  lineas.push("");

  for (const it of d.venta.items) {
    const u = d.unidades?.[it.producto_id] ?? "";
    const cant = `${formatCantidad(it.cantidad, u)}${u ? ` ${u}` : ""}`;
    lineas.push(`${it.producto_nombre}  ${cant} x ${gs(it.precio_venta)} = ${gs(it.total_linea)}`);
  }

  lineas.push("");
  lineas.push(`IVA incluido: ${gs(d.venta.monto_iva)}`);
  lineas.push(`*TOTAL A PAGAR: ${gs(d.venta.total)}*`);
  lineas.push(`Forma de pago: ${d.formaPago}`);
  if (d.emisor?.leyenda) {
    lineas.push("");
    lineas.push(d.emisor.leyenda);
  }
  return lineas.join("\n");
}

/**
 * Columnas de la factura: cada línea va entera a la columna de su IVA (Exentas,
 * 5% o 10%), como en el formato de la SET, y abajo se liquida el IVA contenido.
 * Todo sale de las cifras guardadas en la venta: no se recalcula nada.
 */
export function columnasIva(venta: Venta) {
  const t = { exentas: 0, cinco: 0, diez: 0, iva5: 0, iva10: 0 };
  for (const it of venta.items) {
    if (it.tipo_iva === "EXENTA") t.exentas += it.total_linea;
    else if (it.tipo_iva === "5%") {
      t.cinco += it.total_linea;
      t.iva5 += it.monto_iva;
    } else {
      t.diez += it.total_linea;
      t.iva10 += it.monto_iva;
    }
  }
  return { ...t, ivaTotal: t.iva5 + t.iva10 };
}

/**
 * Número de la factura como lo pide la SET (001-001-0000123) cuando hay
 * establecimiento y punto de expedición cargados; si no, el número interno.
 */
export function numeroFactura(d: DatosComprobante): string {
  const est = d.emisor?.establecimiento;
  const pto = d.emisor?.punto_expedicion;
  const digitos = d.venta.numero_control.replace(/\D+/g, "");
  if (!est || !pto || !digitos) return d.venta.numero_control;
  return `${est.padStart(3, "0")}-${pto.padStart(3, "0")}-${digitos.slice(-7).padStart(7, "0")}`;
}

/** Fecha corta (dd/mm/aaaa) de una fecha ISO o yyyy-mm-dd. */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "";
  const solo = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso;
  const d = new Date(solo);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-PY", { timeZone: "America/Asuncion", day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Vencimiento de una venta a crédito: fecha + plazo. */
export function vencimiento(venta: Venta): string | null {
  if (venta.tipo_venta !== "CREDITO" || !venta.plazo_dias) return null;
  const d = new Date(venta.fecha);
  d.setDate(d.getDate() + venta.plazo_dias);
  return fechaCorta(d.toISOString());
}

/** Número con separador de miles, sin "Gs.": así van las columnas de la factura. */
export function miles(valor: number): string {
  return Math.round(valor).toLocaleString("es-PY");
}

/** Dirección del emisor con ciudad y departamento, en una línea: "RUTA 1 - ITA - CENTRAL". */
export function ubicacionEmisor(e: EmisorComprobante | null): string {
  return [e?.direccion, e?.ciudad, e?.departamento]
    .filter((v): v is string => !!v && v.trim() !== "")
    .join(" - ")
    .toUpperCase();
}

/** Logo de la cabecera de la factura. */
export const LOGO_FACTURA = "/brand/logo-factura.png";

/** "17/09/2026 06:12:25": fecha y hora de emisión como van en la factura. */
export function fechaHoraEmision(iso: string): string {
  const d = new Date(iso);
  const f = d.toLocaleDateString("es-PY", {
    timeZone: "America/Asuncion",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const h = d.toLocaleTimeString("es-PY", {
    timeZone: "America/Asuncion",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return `${f} ${h}`;
}
