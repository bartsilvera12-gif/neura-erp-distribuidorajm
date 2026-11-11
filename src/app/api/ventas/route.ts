import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import type { Venta, LineaVenta, TipoIvaVenta, PagoMixto, MedioMixto } from "@/lib/ventas/types";

interface VentaRow {
  id: string;
  empresa_id: string;
  numero_control: string;
  moneda: string;
  tipo_cambio: number | string;
  subtotal: number | string;
  monto_iva: number | string;
  total: number | string;
  tipo_venta: string;
  plazo_dias: number | null;
  fecha: string;
  estado: string | null;
  metodo_pago: string | null;
  cliente_id: string | null;
  reparto_id: string | null;
  lista_precio: string | null;
  factura_id: string | null;
  descuento_monto: string | number | null;
  descuento_porcentaje: string | number | null;
  descuento_oculto: boolean | string | null;
  observaciones: string | null;
}

interface VentaItemRow {
  venta_id: string;
  producto_id: string;
  producto_nombre: string;
  sku: string;
  cantidad: number | string;
  precio_venta_original: number | string;
  precio_venta: number | string;
  tipo_iva: string;
  subtotal: number | string;
  monto_iva: number | string;
  total_linea: number | string;
}

function num(v: number | string): number {
  return typeof v === "number" ? v : Number(v);
}

function mapItems(rows: VentaItemRow[]): LineaVenta[] {
  return rows.map((r) => ({
    producto_id: r.producto_id,
    producto_nombre: r.producto_nombre,
    sku: r.sku,
    cantidad: num(r.cantidad),
    precio_venta_original: num(r.precio_venta_original),
    precio_venta: num(r.precio_venta),
    tipo_iva: r.tipo_iva as TipoIvaVenta,
    subtotal: num(r.subtotal),
    monto_iva: num(r.monto_iva),
    total_linea: num(r.total_linea),
  }));
}

/**
 * GET /api/ventas — listado via PG directo (soporta tenants erp_* no
 * expuestos por PostgREST).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

    const tV = quoteSchemaTable(schema, "ventas");
    const tI = quoteSchemaTable(schema, "ventas_items");

    // Serializado (no Promise.all) para no agotar el pool session-mode (limite 15).
    // Columnas opcionales (según qué migraciones corrieron): se piden solo si
    // existen. Nombrar una que falta rompe la consulta entera y deja la lista
    // vacía, que es lo peor que puede pasar en esta pantalla.
    const colsQ = await queryWithRetry<{ c: string }>(pool,
      `SELECT column_name AS c FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'ventas'
          AND column_name IN ('metodo_pago', 'cliente_id', 'reparto_id', 'lista_precio', 'factura_id',
                              'descuento_monto', 'descuento_porcentaje', 'descuento_oculto', 'observaciones')`,
      [schema]
    );
    const opc = new Set(colsQ.rows.map((r) => r.c));
    const extra = [
      "metodo_pago",
      "cliente_id",
      "reparto_id",
      "lista_precio",
      "factura_id",
      "descuento_monto",
      "descuento_porcentaje",
      "descuento_oculto",
      "observaciones",
    ]
      .map((c) => (opc.has(c) ? c : `NULL::text AS ${c}`))
      .join(", ");

    const ventasQ = await queryWithRetry<VentaRow>(pool,
      `SELECT id, empresa_id, numero_control, moneda, tipo_cambio, subtotal, monto_iva,
              total, tipo_venta, plazo_dias, fecha, estado, ${extra}
         FROM ${tV} WHERE empresa_id = $1::uuid
        ORDER BY fecha DESC LIMIT 500`,
      [empresaId]
    );

    // Datos para el detalle: nombre del cliente, camión del reparto y unidad
    // de cada producto. Cada uno por separado y a prueba de fallos: si uno no
    // se puede leer, el detalle sale sin ese dato, pero la lista sale igual.
    const idsCliente = [...new Set(ventasQ.rows.map((r) => r.cliente_id).filter(Boolean))] as string[];
    const idsReparto = [...new Set(ventasQ.rows.map((r) => r.reparto_id).filter(Boolean))] as string[];
    const nombreCliente = new Map<string, string>();
    const datosCliente = new Map<string, { ruc: string | null; direccion: string | null }>();
    const etiquetaReparto = new Map<string, string>();
    if (idsCliente.length > 0) {
      try {
        // El nombre se arma con las columnas que el schema tenga: `clientes`
        // varía entre bases y pedir una que falta rompe la consulta.
        const cc = await queryWithRetry<{ c: string }>(pool,
          `SELECT column_name AS c FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = 'clientes'`,
          [schema]
        );
        const hay = new Set(cc.rows.map((r) => r.c));
        const partes = ["empresa", "nombre_contacto", "razon_social", "nombre"]
          .filter((c) => hay.has(c))
          .map((c) => `NULLIF(btrim(cl.${c}), '')`);
        // Persona: primero el nombre de la persona; empresa: primero la empresa.
        const exprNombre =
          partes.length === 0
            ? `'Cliente'`
            : hay.has("tipo_cliente") && hay.has("nombre_contacto")
              ? `CASE WHEN lower(coalesce(cl.tipo_cliente,'')) = 'persona'
                      THEN COALESCE(NULLIF(btrim(cl.nombre_contacto), ''), ${partes.join(", ")}, 'Cliente')
                      ELSE COALESCE(${partes.join(", ")}, 'Cliente') END`
              : `COALESCE(${partes.join(", ")}, 'Cliente')`;
        const rucs = ["ruc_factura", "ruc", "documento"]
          .filter((c) => hay.has(c))
          .map((c) => `NULLIF(btrim(cl.${c}), '')`);
        const exprRuc = rucs.length > 0 ? `COALESCE(${rucs.join(", ")})` : "NULL::text";
        const exprDir = hay.has("direccion") ? "NULLIF(btrim(cl.direccion), '')" : "NULL::text";
        const q = await queryWithRetry<{
          id: string;
          nombre: string;
          ruc: string | null;
          direccion: string | null;
        }>(pool,
          `SELECT cl.id, ${exprNombre} AS nombre, ${exprRuc} AS ruc, ${exprDir} AS direccion
             FROM ${quoteSchemaTable(schema, "clientes")} cl WHERE cl.id = ANY($1::uuid[])`,
          [idsCliente]
        );
        for (const r of q.rows) {
          nombreCliente.set(r.id, r.nombre);
          datosCliente.set(r.id, { ruc: r.ruc, direccion: r.direccion });
        }
      } catch (e) {
        console.warn("[/api/ventas GET] nombres de cliente:", e instanceof Error ? e.message : e);
      }
    }
    if (idsReparto.length > 0) {
      try {
        const uc = await queryWithRetry<{ c: string }>(pool,
          `SELECT column_name AS c FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = 'usuarios' AND column_name IN ('nombre', 'email')`,
          [schema]
        );
        const uHay = new Set(uc.rows.map((r) => r.c));
        const usuarioNombre = uHay.has("nombre")
          ? uHay.has("email") ? "COALESCE(NULLIF(btrim(u.nombre), ''), u.email)" : "u.nombre"
          : uHay.has("email") ? "u.email" : "NULL::text";
        const q = await queryWithRetry<{ id: string; camion: string | null; repartidor: string | null }>(pool,
          `SELECT r.id, c.alias AS camion, ${usuarioNombre} AS repartidor
             FROM ${quoteSchemaTable(schema, "repartos")} r
             LEFT JOIN ${quoteSchemaTable(schema, "camiones")} c ON c.id = r.camion_id
             LEFT JOIN ${quoteSchemaTable(schema, "usuarios")} u ON u.id = r.repartidor_id
            WHERE r.id = ANY($1::uuid[])`,
          [idsReparto]
        );
        for (const r of q.rows) {
          etiquetaReparto.set(r.id, [r.camion, r.repartidor].filter(Boolean).join(" · ") || "Reparto");
        }
      } catch (e) {
        console.warn("[/api/ventas GET] repartos:", e instanceof Error ? e.message : e);
      }
    }
    // Factura electrónica de cada venta (si se emitió por SIFEN desde la caja):
    // número tal como lo ve la SET (sale del CDC) y en qué estado quedó.
    const idsFactura = [...new Set(ventasQ.rows.map((r) => r.factura_id).filter(Boolean))] as string[];
    const facturaDe = new Map<string, { numero: string; estado: string | null }>();
    if (idsFactura.length > 0) {
      try {
        const q = await queryWithRetry<{ id: string; numero_factura: string; estado_sifen: string | null; cdc: string | null }>(pool,
          `SELECT f.id, f.numero_factura, fe.estado_sifen, fe.cdc
             FROM ${quoteSchemaTable(schema, "facturas")} f
             LEFT JOIN ${quoteSchemaTable(schema, "factura_electronica")} fe ON fe.factura_id = f.id
            WHERE f.id = ANY($1::uuid[])`,
          [idsFactura]
        );
        for (const r of q.rows) {
          const cdc = (r.cdc ?? "").replace(/\D/g, "");
          const numero = cdc.length >= 24
            ? `${cdc.slice(11, 14)}-${cdc.slice(14, 17)}-${cdc.slice(17, 24)}`
            : r.numero_factura;
          facturaDe.set(r.id, { numero, estado: r.estado_sifen ?? null });
        }
      } catch (e) {
        console.warn("[/api/ventas GET] facturas:", e instanceof Error ? e.message : e);
      }
    }

    // Solo los ítems de las ventas listadas: antes se traían los de TODA la
    // historia de la empresa en cada carga (crece cientos de filas por día).
    const idsVentas = ventasQ.rows.map((r) => r.id);
    const itemsQ = await queryWithRetry<VentaItemRow>(pool,
      `SELECT venta_id, producto_id, producto_nombre, sku, cantidad,
              precio_venta_original, precio_venta, tipo_iva, subtotal, monto_iva, total_linea
         FROM ${tI} WHERE empresa_id = $1::uuid AND venta_id = ANY($2::uuid[])`,
      [empresaId, idsVentas]
    );

    // Detalle del pago mixto: cuando la venta se cobró con más de un medio,
    // el servidor insertó una fila por medio en `caja_movimientos` con el
    // `venta_id`. Las agrupamos acá para que la tabla de Ventas pueda
    // mostrar "Efectivo Gs. X · Transferencia Gs. Y" en vez de solo "Mixto".
    // La consulta solo se dispara si hay al menos una venta mixta en la lista
    // (pedido explícito de la clienta de Distribuidora JM, soporte punto 4).
    const idsMixto = ventasQ.rows
      .filter((r) => (r.metodo_pago ?? "").toLowerCase() === "mixto")
      .map((r) => r.id);
    const pagosDe = new Map<string, PagoMixto[]>();
    if (idsMixto.length > 0) {
      try {
        const existeQ = await queryWithRetry<{ existe: string | null }>(pool,
          `SELECT to_regclass($1)::text AS existe`,
          [`${schema}.caja_movimientos`]
        );
        if (existeQ.rows[0]?.existe !== null) {
          const mq = await queryWithRetry<{ venta_id: string; medio_pago: string | null; monto: string }>(
            pool,
            `SELECT venta_id, medio_pago, SUM(monto)::text AS monto
               FROM ${quoteSchemaTable(schema, "caja_movimientos")}
              WHERE empresa_id = $1::uuid
                AND venta_id = ANY($2::uuid[])
                AND tipo = 'ingreso'
              GROUP BY venta_id, medio_pago
              ORDER BY medio_pago`,
            [empresaId, idsMixto]
          );
          const mediosValidos: ReadonlyArray<string> = ["efectivo", "transferencia", "cheque"];
          for (const r of mq.rows) {
            const medio = (r.medio_pago ?? "").toLowerCase();
            if (!mediosValidos.includes(medio)) continue;
            const monto = Math.round(Number(r.monto) || 0);
            if (monto <= 0) continue;
            const lista = pagosDe.get(r.venta_id) ?? [];
            lista.push({ medio: medio as MedioMixto, monto });
            pagosDe.set(r.venta_id, lista);
          }
        }
      } catch (e) {
        // Un fallo acá no debe tumbar la lista: en el peor caso, la columna
        // "Método de pago" sigue mostrando "Mixto" sin el detalle, como antes.
        console.warn("[/api/ventas GET] pagos mixtos:", e instanceof Error ? e.message : e);
      }
    }

    const unidadProducto = new Map<string, string>();
    try {
      const q = await queryWithRetry<{ id: string; unidad_medida: string | null }>(pool,
        `SELECT id, unidad_medida FROM ${quoteSchemaTable(schema, "productos")}
          WHERE empresa_id = $1::uuid AND id = ANY($2::uuid[])`,
        [empresaId, [...new Set(itemsQ.rows.map((r) => r.producto_id).filter(Boolean))]]
      );
      for (const r of q.rows) if (r.unidad_medida) unidadProducto.set(r.id, r.unidad_medida);
    } catch (e) {
      console.warn("[/api/ventas GET] unidades:", e instanceof Error ? e.message : e);
    }

    const byVenta = new Map<string, VentaItemRow[]>();
    for (const row of itemsQ.rows) {
      const list = byVenta.get(row.venta_id) ?? [];
      list.push(row);
      byVenta.set(row.venta_id, list);
    }

    const ventas: Venta[] = ventasQ.rows.map((r) => {
      const lineRows = byVenta.get(r.id) ?? [];
      return {
        id: r.id,
        numero_control: r.numero_control,
        items: mapItems(lineRows).map((it) => ({
          ...it,
          unidad_medida: unidadProducto.get(it.producto_id) ?? null,
        })),
        moneda: r.moneda === "USD" ? "USD" : "GS",
        tipo_cambio: num(r.tipo_cambio),
        subtotal: num(r.subtotal),
        monto_iva: num(r.monto_iva),
        total: num(r.total),
        tipo_venta: r.tipo_venta === "CREDITO" ? "CREDITO" : "CONTADO",
        plazo_dias: r.plazo_dias ?? undefined,
        fecha: r.fecha,
        estado: r.estado ?? null,
        metodo_pago: (r.metodo_pago as Venta["metodo_pago"]) ?? null,
        pagos_detalle: pagosDe.get(r.id) ?? null,
        cliente_id: r.cliente_id ?? null,
        cliente_nombre: r.cliente_id ? nombreCliente.get(r.cliente_id) ?? null : null,
        cliente_ruc: r.cliente_id ? datosCliente.get(r.cliente_id)?.ruc ?? null : null,
        cliente_direccion: r.cliente_id ? datosCliente.get(r.cliente_id)?.direccion ?? null : null,
        reparto_id: r.reparto_id ?? null,
        reparto_etiqueta: r.reparto_id ? etiquetaReparto.get(r.reparto_id) ?? null : null,
        lista_precio: r.lista_precio === "mayorista" ? "mayorista" : "minorista",
        factura_id: r.factura_id ?? null,
        factura_numero: r.factura_id ? facturaDe.get(r.factura_id)?.numero ?? null : null,
        factura_estado_sifen: r.factura_id ? facturaDe.get(r.factura_id)?.estado ?? null : null,
        ...descuentoDe(r),
      };
    });

    return NextResponse.json(successResponse({ ventas }));
  } catch (err) {
    console.error("[/api/ventas GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar las ventas."), { status: 500 });
  }
}

/**
 * Descuento de la venta: de sus columnas (SQL 62) o, si todavía no corrió,
 * de lo que quedó escrito en las observaciones («Descuento 2% (Gs. 52.000)…»).
 */
function descuentoDe(
  r: VentaRow
): { descuento_monto?: number; descuento_porcentaje?: number; descuento_oculto?: boolean } {
  const oculto = r.descuento_oculto === true || r.descuento_oculto === "t" || r.descuento_oculto === "true";
  const monto = Number(r.descuento_monto ?? 0) || 0;
  if (monto > 0) {
    return {
      descuento_monto: monto,
      descuento_porcentaje: Number(r.descuento_porcentaje ?? 0) || 0,
      ...(oculto ? { descuento_oculto: true } : {}),
    };
  }
  const m = /Descuento ([\d.,]+)% \(Gs\. ([\d.]+)\)/.exec(r.observaciones ?? "");
  if (!m) return {};
  return {
    descuento_monto: Number(m[2].replace(/\./g, "")) || 0,
    descuento_porcentaje: Number(m[1].replace(/\./g, "").replace(",", ".")) || 0,
    ...(oculto ? { descuento_oculto: true } : {}),
  };
}
