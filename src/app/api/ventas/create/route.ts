import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { createVentaTransaccionalPg } from "@/lib/ventas/server/create-venta-pg";
import type { CreateVentaItemInput } from "@/lib/ventas/server/create-venta-pg";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { puede } from "@/lib/usuarios/server/permisos-pg";
import { asegurarCajaAbierta } from "@/lib/cajas/server/asegurar-caja";
import { asegurarRepartoAbierto } from "@/lib/repartos/server/asegurar-reparto";
import { usuarioDelSchema } from "@/lib/repartos/server/repartos-pg";
import type { Venta, LineaVenta } from "@/lib/ventas/types";

function asItems(body: unknown): CreateVentaItemInput[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { items?: unknown }).items;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: CreateVentaItemInput[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") return null;
    const r = x as Record<string, unknown>;
    const tipoIva = r.tipo_iva;
    if (tipoIva !== "EXENTA" && tipoIva !== "5%" && tipoIva !== "10%") return null;
    out.push({
      producto_id: String(r.producto_id ?? ""),
      producto_nombre: String(r.producto_nombre ?? ""),
      sku: String(r.sku ?? ""),
      cantidad: Number(r.cantidad),
      precio_venta_original: Number(r.precio_venta_original),
      precio_venta: Number(r.precio_venta),
      tipo_iva: tipoIva,
      subtotal: Number(r.subtotal),
      monto_iva: Number(r.monto_iva),
      total_linea: Number(r.total_linea),
    });
  }
  if (out.some((i) => !i.producto_id || !(i.cantidad > 0))) return null;
  return out;
}

function toVentaResponse(
  items: CreateVentaItemInput[],
  meta: {
    id: string;
    numero_control: string;
    fechaIso: string;
    moneda: Venta["moneda"];
    tipo_cambio: number;
    tipo_venta: Venta["tipo_venta"];
    plazo_dias?: number;
    subtotal: number;
    monto_iva: number;
    total: number;
  }
): Venta {
  const lineas: LineaVenta[] = items.map((i) => ({
    producto_id: i.producto_id,
    producto_nombre: i.producto_nombre,
    sku: i.sku,
    cantidad: i.cantidad,
    precio_venta_original: i.precio_venta_original,
    precio_venta: i.precio_venta,
    tipo_iva: i.tipo_iva,
    subtotal: i.subtotal,
    monto_iva: i.monto_iva,
    total_linea: i.total_linea,
  }));
  return {
    id: meta.id,
    numero_control: meta.numero_control,
    items: lineas,
    moneda: meta.moneda,
    tipo_cambio: meta.tipo_cambio,
    subtotal: meta.subtotal,
    monto_iva: meta.monto_iva,
    total: meta.total,
    tipo_venta: meta.tipo_venta,
    plazo_dias: meta.plazo_dias,
    fecha: meta.fechaIso,
  };
}

/**
 * POST /api/ventas/create — venta + ítems + stock + movimientos (una transacción Postgres).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getUserAndEmpresa(request);
    if (!auth) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }

    const items = asItems(body);
    if (!items) {
      return NextResponse.json(errorResponse("Payload inválido: items requeridos."), { status: 400 });
    }

    const o = body as Record<string, unknown>;
    const moneda = o.moneda === "USD" ? "USD" : "GS";
    const tipoCambio = Number(o.tipo_cambio) || 1;
    const tipoVenta = o.tipo_venta === "CREDITO" ? "CREDITO" : "CONTADO";
    const plazoDias =
      tipoVenta === "CREDITO" && o.plazo_dias != null && String(o.plazo_dias).trim() !== ""
        ? parseInt(String(o.plazo_dias), 10)
        : null;
    const clienteRaw = o.cliente_id;
    const clienteId =
      clienteRaw === null || clienteRaw === undefined || clienteRaw === ""
        ? null
        : String(clienteRaw);
    const observaciones =
      o.observaciones === null || o.observaciones === undefined
        ? null
        : String(o.observaciones).slice(0, 4000);

    const repartoRaw = o.reparto_id;
    const repartoId =
      repartoRaw === null || repartoRaw === undefined || repartoRaw === ""
        ? null
        : String(repartoRaw);

    const METODOS_VALIDOS = ["efectivo", "tarjeta", "transferencia", "cheque", "mixto"] as const;
    type Metodo = (typeof METODOS_VALIDOS)[number];
    const metodoRaw = String(o.metodo_pago ?? "").trim().toLowerCase();
    const metodoPago = (METODOS_VALIDOS as readonly string[]).includes(metodoRaw)
      ? (metodoRaw as Metodo)
      : null;

    const cajaRaw = o.caja_id;
    const cajaId =
      cajaRaw === null || cajaRaw === undefined || cajaRaw === "" ? null : String(cajaRaw);

    // Una venta de contado cobra plata: sin medio de cobro no se sabe cómo
    // entró, y el arqueo queda sin poder cuadrar.
    if (tipoVenta === "CONTADO" && metodoPago === null) {
      return NextResponse.json(errorResponse("Indicá con qué se cobra la venta."), { status: 400 });
    }
    // A crédito no se cobra ahora: un medio de cobro acá sería mentira.
    if (tipoVenta === "CREDITO" && metodoPago !== null) {
      return NextResponse.json(
        errorResponse("Una venta a crédito no se cobra al emitirla: el medio se registra al cobrar."),
        { status: 400 }
      );
    }

    const subtotalDeclarado = Number(o.subtotal);
    const montoIvaDeclarado = Number(o.monto_iva);
    const totalDeclarado = Number(o.total);

    if ([subtotalDeclarado, montoIvaDeclarado, totalDeclarado].some((n) => Number.isNaN(n))) {
      return NextResponse.json(errorResponse("Totales inválidos."), { status: 400 });
    }

    if (moneda === "USD" && tipoCambio <= 0) {
      return NextResponse.json(errorResponse("Tipo de cambio inválido para USD."), { status: 400 });
    }

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);

    // Vender a crédito es comprometer plata de la empresa: se puede negar por
    // usuario. Se valida acá y no solo escondiendo el switch en la pantalla.
    if (
      tipoVenta === "CREDITO" &&
      !(await puede(
        { schema, empresaId: auth.empresa_id, email: auth.user.email },
        "venta.credito"
      ))
    ) {
      return NextResponse.json(errorResponse("No tenés permiso para vender a crédito."), {
        status: 403,
      });
    }

    // Toda venta de contado necesita una caja donde imputarse, pero pedirla a
    // mano era un paso que en la calle nadie daba: el vendedor quiere cobrar.
    // Si no hay ninguna abierta se abre una en 0, que es el saldo real —el
    // camión sale sin plata en el cajón—, y se cierra con el cierre de reparto.
    let cajaFinal = cajaId;
    if (tipoVenta === "CONTADO" && cajaFinal === null) {
      cajaFinal = await asegurarCajaAbierta(schema, auth.empresa_id, auth.usuarioCatalogId);
      if (cajaFinal === null) {
        return NextResponse.json(
          errorResponse("No se pudo abrir la caja para cobrar esta venta."),
          { status: 409 }
        );
      }
    }

    // Si el que vende tiene un camión asignado, la venta sale de su reparto
    // aunque nadie lo haya abierto esa mañana: se abre solo, con el saldo que
    // quedó arriba del cierre anterior. Sin esto la venta queda sin camión, la
    // mercadería sale del stock general y el cierre del día dice "sin reparto"
    // con el camión en la calle.
    let repartoFinal = repartoId;
    if (repartoFinal === null) {
      const yo = await usuarioDelSchema({
        schema,
        empresaId: auth.empresa_id,
        email: auth.user.email,
      });
      repartoFinal = await asegurarRepartoAbierto(schema, auth.empresa_id, yo?.id ?? null);
    }

    const { ventaId, numeroControl, fechaIso } = await createVentaTransaccionalPg({
      schema,
      empresaId: auth.empresa_id,
      clienteId,
      observaciones,
      moneda,
      tipoCambio,
      tipoVenta,
      metodoPago,
      cajaId: cajaFinal,
      repartoId: repartoFinal,
      plazoDias: Number.isFinite(plazoDias as number) ? plazoDias : null,
      items,
      subtotalDeclarado,
      montoIvaDeclarado,
      totalDeclarado,
    });

    let sub = 0;
    let iv = 0;
    let tot = 0;
    for (const it of items) {
      sub += it.subtotal;
      iv += it.monto_iva;
      tot += it.total_linea;
    }

    const venta = toVentaResponse(items, {
      id: ventaId,
      numero_control: numeroControl,
      fechaIso,
      moneda,
      tipo_cambio: tipoCambio,
      tipo_venta: tipoVenta,
      plazo_dias: tipoVenta === "CREDITO" ? plazoDias ?? undefined : undefined,
      subtotal: sub,
      monto_iva: iv,
      total: tot,
    });

    return NextResponse.json(successResponse({ venta }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al crear la venta.";
    const status =
      msg.includes("Stock insuficiente") ||
      msg.includes("no existen") ||
      msg.includes("Cliente no encontrado") ||
      msg.includes("Totales no coinciden") ||
      msg.includes("al menos un")
        ? 400
        : 500;
    return NextResponse.json(errorResponse(msg), { status });
  }
}
