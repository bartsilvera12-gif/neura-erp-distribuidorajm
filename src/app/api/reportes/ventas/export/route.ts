import { NextRequest } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { buildXlsxBuffer, xlsxResponseHeaders, nowStamp } from "@/lib/excel/export";
import { getReporteVentasRango, hoyEnAsuncion } from "@/lib/reportes/ventas-reporte";

export const runtime = "nodejs";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/reportes/ventas/export — Excel del reporte de ventas.
 *
 * Va todo en una hoja, con los cortes uno debajo del otro y un renglón de
 * título en cada uno. Es más práctico para imprimir o mandar por correo que
 * cuatro hojas separadas, que es lo que nadie abre.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return new Response("No autorizado", { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);

    const sp = new URL(request.url).searchParams;
    const hoy = hoyEnAsuncion();
    const desde = FECHA.test(sp.get("desde") ?? "") ? sp.get("desde")! : hoy;
    const hasta = FECHA.test(sp.get("hasta") ?? "") ? sp.get("hasta")! : hoy;

    const r = await getReporteVentasRango(schema, ctx.auth.empresa_id, desde, hasta);

    type Fila = { a: string; b: string | number; c: string | number; d: string | number };
    const filas: Fila[] = [];
    const titulo = (t: string) => filas.push({ a: t, b: "", c: "", d: "" });
    const vacia = () => filas.push({ a: "", b: "", c: "", d: "" });

    titulo(`REPORTE DE VENTAS — ${desde} al ${hasta}`);
    vacia();
    titulo("RESUMEN");
    filas.push({ a: "Total vendido", b: r.resumen.total, c: "", d: "" });
    filas.push({ a: "Cantidad de ventas", b: r.resumen.ventas, c: "", d: "" });
    filas.push({ a: "Ticket promedio", b: Math.round(r.resumen.ticket_promedio), c: "", d: "" });
    filas.push({ a: "Contado", b: r.resumen.contado, c: "", d: "" });
    filas.push({ a: "Crédito", b: r.resumen.credito, c: "", d: "" });
    filas.push({ a: "Días con venta", b: r.resumen.dias_con_venta, c: "", d: "" });

    vacia();
    titulo("POR DÍA");
    filas.push({ a: "Día", b: "Ventas", c: "Total", d: "" });
    for (const d of r.por_dia) filas.push({ a: d.dia, b: d.ventas, c: d.total, d: "" });

    if (r.por_cliente.length > 0) {
      vacia();
      titulo("POR CLIENTE");
      filas.push({ a: "Cliente", b: "Ventas", c: "Total", d: "Participación %" });
      for (const c of r.por_cliente) {
        filas.push({ a: c.etiqueta, b: c.ventas, c: c.total, d: Number(c.participacion.toFixed(1)) });
      }
    }

    if (r.por_producto.length > 0) {
      vacia();
      titulo("POR PRODUCTO");
      filas.push({ a: "Producto", b: "Cantidad", c: "Total", d: "Participación %" });
      for (const p of r.por_producto) {
        filas.push({ a: p.producto, b: p.cantidad, c: p.total, d: Number(p.participacion.toFixed(1)) });
      }
    }

    if (r.por_metodo.length > 0) {
      vacia();
      titulo("POR MÉTODO DE PAGO");
      filas.push({ a: "Método", b: "Ventas", c: "Total", d: "Participación %" });
      for (const m of r.por_metodo) {
        filas.push({ a: m.etiqueta, b: m.ventas, c: m.total, d: Number(m.participacion.toFixed(1)) });
      }
    }

    const buf = buildXlsxBuffer(
      filas,
      [
        { header: "", value: (f) => f.a, width: 38 },
        { header: "", value: (f) => f.b, width: 16 },
        { header: "", value: (f) => f.c, width: 18 },
        { header: "", value: (f) => f.d, width: 16 },
      ],
      { sheetName: "Ventas" }
    );

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: xlsxResponseHeaders(`ventas-${desde}_${hasta}-${nowStamp()}`),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/reportes/ventas/export]", msg);
    // El motivo viaja al cliente: sin esto un 500 obliga a mirar los logs.
    return new Response(msg || "No se pudo generar el Excel", { status: 500 });
  }
}
