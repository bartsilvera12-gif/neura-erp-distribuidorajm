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
  timbrado_numero: string | null;
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
      timbrado_numero: txt(a.timbrado_numero),
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
