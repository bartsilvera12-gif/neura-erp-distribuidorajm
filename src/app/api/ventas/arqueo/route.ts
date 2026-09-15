import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { FORMAS_PAGO, type FormaPagoVenta } from "@/lib/ventas/types";

/** Zona del negocio. Sin esto, una venta de las 21:00 cae en el día siguiente. */
const TZ = "America/Asuncion";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

type FilaRow = {
  forma_pago: string | null;
  cantidad: string;
  total: string;
  tipo_venta: string;
};

function num(v: string | number | null): number {
  if (v === null) return 0;
  return typeof v === "number" ? v : Number(v);
}

/**
 * GET /api/ventas/arqueo?fecha=YYYY-MM-DD
 *
 * Cierre de caja del día: cuántas ventas y cuánto se cobró por cada medio.
 * Si no se pasa fecha, usa hoy en hora de Asunción.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

    const pedida = request.nextUrl.searchParams.get("fecha")?.trim() ?? "";
    if (pedida && !FECHA_RE.test(pedida)) {
      return NextResponse.json(errorResponse("Fecha inválida: se espera YYYY-MM-DD."), {
        status: 400,
      });
    }

    const tV = quoteSchemaTable(schema, "ventas");

    // `forma_pago` se agrega con 05_forma_pago.sql. Sin la columna igual damos el
    // total del día: es preferible un arqueo sin desglose a una pantalla rota.
    const colQ = await queryWithRetry<{ existe: boolean }>(
      pool,
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'ventas' AND column_name = 'forma_pago'
       ) AS existe`,
      [schema]
    );
    const tieneFormaPago = colQ.rows[0]?.existe === true;

    // La fecha efectiva se resuelve en el servidor de base para que "hoy" sea el
    // mismo día que usa el filtro, aunque el navegador esté en otra zona.
    const fechaQ = await queryWithRetry<{ fecha: string }>(
      pool,
      `SELECT COALESCE(NULLIF($1, '')::date, (now() AT TIME ZONE $2)::date)::text AS fecha`,
      [pedida, TZ]
    );
    const fecha = fechaQ.rows[0].fecha;

    const columnaMedio = tieneFormaPago ? "forma_pago" : "NULL::text AS forma_pago";
    const agrupaPor = tieneFormaPago ? "forma_pago, tipo_venta" : "tipo_venta";

    const filasQ = await queryWithRetry<FilaRow>(
      pool,
      `SELECT ${columnaMedio},
              tipo_venta,
              count(*)::text        AS cantidad,
              COALESCE(sum(total), 0)::text AS total
         FROM ${tV}
        WHERE empresa_id = $1::uuid
          AND COALESCE(estado, '') <> 'anulada'
          AND (fecha AT TIME ZONE $2)::date = $3::date
        GROUP BY ${agrupaPor}`,
      [empresaId, TZ, fecha]
    );

    // Todos los medios aparecen siempre, aunque estén en cero: un arqueo con
    // filas que aparecen y desaparecen no se puede comparar entre días.
    const porMedio = new Map<FormaPagoVenta, { cantidad: number; total: number }>(
      FORMAS_PAGO.map((f) => [f.value, { cantidad: 0, total: 0 }])
    );
    const sinClasificar = { cantidad: 0, total: 0 };
    let contado = 0;
    let credito = 0;

    for (const row of filasQ.rows) {
      const cantidad = num(row.cantidad);
      const total = num(row.total);

      if (row.tipo_venta === "CREDITO") credito += total;
      else contado += total;

      const medio = row.forma_pago as FormaPagoVenta | null;
      const destino = medio !== null ? porMedio.get(medio) : undefined;
      if (destino) {
        destino.cantidad += cantidad;
        destino.total += total;
      } else {
        // Ventas anteriores a la columna, o un valor que no reconocemos: no se
        // descartan, se muestran aparte para que el desglose cierre con el total.
        sinClasificar.cantidad += cantidad;
        sinClasificar.total += total;
      }
    }

    const lineas = FORMAS_PAGO.map((f) => ({
      forma_pago: f.value,
      label: f.label,
      cantidad: porMedio.get(f.value)!.cantidad,
      total: porMedio.get(f.value)!.total,
    }));

    const cantidadTotal =
      lineas.reduce((acc, l) => acc + l.cantidad, 0) + sinClasificar.cantidad;
    const total = lineas.reduce((acc, l) => acc + l.total, 0) + sinClasificar.total;

    return NextResponse.json(
      successResponse({
        arqueo: {
          fecha,
          tiene_forma_pago: tieneFormaPago,
          lineas,
          sin_clasificar: sinClasificar,
          totales: { cantidad: cantidadTotal, total, contado, credito },
        },
      })
    );
  } catch (err) {
    console.error("[/api/ventas/arqueo GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo calcular el arqueo."), { status: 500 });
  }
}
