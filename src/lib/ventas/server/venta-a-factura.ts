import "server-only";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { obtenerSiguienteNumeroFacturaEmpresa } from "@/lib/facturacion/factura-suscripcion-servidor";
import { montosFacturaItemParaInsert } from "@/lib/facturacion/factura-item-montos";

/**
 * La factura de una venta de la caja, para emitirla por SIFEN.
 *
 * Se crea una sola vez por venta (`ventas.factura_id`, SQL 45): si ya existe,
 * se devuelve esa. Cada línea de la venta pasa a la factura con su cantidad,
 * su precio y su IVA, que es lo que la SET valida línea por línea.
 *
 * Al contado la factura nace pagada: la plata ya entró por la caja, y si
 * quedara "Pendiente" aparecería como deuda del cliente en Cobranzas.
 */

type Fallo = { ok: false; status: number; message: string };
export type FacturaDeVenta = { ok: true; facturaId: string } | Fallo;

type VentaRow = {
  id: string;
  cliente_id: string | null;
  factura_id: string | null;
  fecha: string;
  moneda: string | null;
  total: number | string;
  tipo_venta: string | null;
  plazo_dias: number | null;
  estado: string | null;
};

type ItemRow = {
  producto_nombre: string | null;
  cantidad: number | string;
  precio_venta: number | string;
  tipo_iva: string | null;
  total_linea: number | string;
};

function tasaDe(tipoIva: string | null): 0 | 5 | 10 {
  const v = (tipoIva ?? "").trim().toUpperCase();
  if (v === "EXENTA" || v === "0" || v === "0%") return 0;
  if (v === "5%" || v === "5") return 5;
  return 10;
}

/** yyyy-mm-dd en hora de Paraguay. */
function fechaPy(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Asuncion" });
}

export async function facturaDeVenta(
  supabase: AppSupabaseClient,
  empresaId: string,
  ventaId: string
): Promise<FacturaDeVenta> {
  const { data: venta, error: errV } = await supabase
    .from("ventas")
    .select("id, cliente_id, factura_id, fecha, moneda, total, tipo_venta, plazo_dias, estado")
    .eq("id", ventaId)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (errV) {
    const falta = /factura_id/.test(errV.message);
    return {
      ok: false,
      status: falta ? 409 : 400,
      message: falta
        ? "Falta correr el SQL 45 (venta → factura electrónica)."
        : errV.message,
    };
  }
  const v = venta as VentaRow | null;
  if (!v) return { ok: false, status: 404, message: "Venta no encontrada." };
  if ((v.estado ?? "").toLowerCase() === "anulada") {
    return { ok: false, status: 409, message: "La venta está anulada: no se factura." };
  }
  if (v.factura_id) return { ok: true, facturaId: v.factura_id };
  if (!v.cliente_id) {
    return {
      ok: false,
      status: 400,
      message:
        "Para la factura electrónica elegí un cliente con RUC o cédula. Una venta Sin nombre sale con ticket.",
    };
  }

  const { data: itemsData, error: errI } = await supabase
    .from("ventas_items")
    .select("producto_nombre, cantidad, precio_venta, tipo_iva, total_linea")
    .eq("venta_id", ventaId)
    .eq("empresa_id", empresaId);
  if (errI) return { ok: false, status: 400, message: errI.message };
  const items = (itemsData ?? []) as ItemRow[];
  if (items.length === 0) return { ok: false, status: 400, message: "La venta no tiene productos." };

  const moneda = v.moneda === "USD" ? "USD" : "GS";
  const total = Number(v.total) || 0;
  const credito = (v.tipo_venta ?? "").toUpperCase() === "CREDITO";
  const fecha = fechaPy(new Date(v.fecha));
  const vence = new Date(v.fecha);
  if (credito) vence.setDate(vence.getDate() + (Number(v.plazo_dias) > 0 ? Number(v.plazo_dias) : 30));

  const numero = await obtenerSiguienteNumeroFacturaEmpresa(supabase, empresaId);
  const { data: factura, error: errF } = await supabase
    .from("facturas")
    .insert([
      {
        empresa_id: empresaId,
        cliente_id: v.cliente_id,
        numero_factura: numero,
        fecha,
        fecha_vencimiento: credito ? fechaPy(vence) : fecha,
        monto: total,
        saldo: credito ? total : 0,
        estado: credito ? "Pendiente" : "Pagado",
        tipo: credito ? "credito" : "contado",
        moneda,
      },
    ])
    .select("id")
    .single();
  if (errF || !factura?.id) {
    return { ok: false, status: 400, message: errF?.message ?? "No se pudo crear la factura." };
  }
  const facturaId = String(factura.id);

  const filas = items.map((it) => {
    const cantidad = Number(it.cantidad) || 1;
    const m = montosFacturaItemParaInsert({
      totalLinea: Number(it.total_linea) || 0,
      moneda,
      cantidad,
      precioUnitario: Number(it.precio_venta) || 0,
      tasaIva: tasaDe(it.tipo_iva),
    });
    return {
      factura_id: facturaId,
      empresa_id: empresaId,
      descripcion: (it.producto_nombre ?? "Producto").trim() || "Producto",
      cantidad,
      precio_unitario: m.precio_unitario,
      subtotal: m.subtotal,
      iva: m.iva,
      total: m.total,
    };
  });
  const { error: errItems } = await supabase.from("factura_items").insert(filas);
  if (errItems) {
    await supabase.from("facturas").delete().eq("id", facturaId).eq("empresa_id", empresaId);
    return { ok: false, status: 400, message: `No se pudo armar el detalle de la factura: ${errItems.message}` };
  }

  const { error: errLink } = await supabase
    .from("ventas")
    .update({ factura_id: facturaId })
    .eq("id", ventaId)
    .eq("empresa_id", empresaId);
  if (errLink) {
    await supabase.from("factura_items").delete().eq("factura_id", facturaId).eq("empresa_id", empresaId);
    await supabase.from("facturas").delete().eq("id", facturaId).eq("empresa_id", empresaId);
    return { ok: false, status: 400, message: errLink.message };
  }
  return { ok: true, facturaId };
}
