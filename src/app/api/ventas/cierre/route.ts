import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/** Zona del negocio: el día del cierre es el día calendario en Paraguay. */
const TZ = "America/Asuncion";
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function num(v: string | number | null): number {
  if (v === null) return 0;
  return typeof v === "number" ? v : Number(v);
}

/** `metodo_pago` es texto libre; agrupamos las variantes conocidas. */
function etiquetaMetodo(clave: string): string {
  if (clave === "efectivo") return "Efectivo";
  if (clave === "transferencia") return "Transferencia";
  if (clave === "cheque") return "Cheque";
  if (clave === "tarjeta") return "Tarjeta";
  if (clave === "") return "Sin registrar";
  return clave.charAt(0).toUpperCase() + clave.slice(1);
}

/**
 * GET /api/ventas/cierre?fecha=YYYY-MM-DD
 *
 * Cierre del día: lo vendido (facturado, contado, crédito, anulado) y lo
 * cobrado por método. Son dos cosas distintas —una venta a crédito factura hoy
 * y se cobra otro día—, así que van separadas y no se suman.
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

    const fechaQ = await queryWithRetry<{ fecha: string }>(
      pool,
      `SELECT COALESCE(NULLIF($1, '')::date, (now() AT TIME ZONE $2)::date)::text AS fecha`,
      [pedida, TZ]
    );
    const fecha = fechaQ.rows[0].fecha;

    // ── Ventas del día ──────────────────────────────────────────────────────
    const tV = quoteSchemaTable(schema, "ventas");
    const ventasQ = await queryWithRetry<{
      anulada: boolean;
      tipo_venta: string;
      cantidad: string;
      total: string;
    }>(
      pool,
      `SELECT (COALESCE(estado, '') = 'anulada') AS anulada,
              tipo_venta,
              count(*)::text                AS cantidad,
              COALESCE(sum(total), 0)::text AS total
         FROM ${tV}
        WHERE empresa_id = $1::uuid
          AND (fecha AT TIME ZONE $2)::date = $3::date
        GROUP BY 1, 2`,
      [empresaId, TZ, fecha]
    );

    const ventas = {
      facturado: 0,
      contado: 0,
      credito: 0,
      cantidad: 0,
      anuladas: { cantidad: 0, total: 0 },
    };
    for (const row of ventasQ.rows) {
      const cantidad = num(row.cantidad);
      const total = num(row.total);
      if (row.anulada) {
        // Las anuladas se informan aparte y NO entran en lo facturado: si se
        // sumaran, el cierre cuadraría contra plata que nunca entró.
        ventas.anuladas.cantidad += cantidad;
        ventas.anuladas.total += total;
        continue;
      }
      ventas.facturado += total;
      ventas.cantidad += cantidad;
      if (row.tipo_venta === "CREDITO") ventas.credito += total;
      else ventas.contado += total;
    }

    // ── Cobranzas del día ───────────────────────────────────────────────────
    // `pagos` puede no existir en todos los schemas: sin la tabla el cierre
    // sigue mostrando las ventas en vez de romperse entero.
    const tablaPagosQ = await queryWithRetry<{ existe: string | null }>(
      pool,
      `SELECT to_regclass($1)::text AS existe`,
      [`${schema}.pagos`]
    );
    const hayPagos = tablaPagosQ.rows[0]?.existe !== null;

    let cobranzas: {
      disponible: boolean;
      lineas: { metodo: string; label: string; cantidad: number; total: number }[];
      total: number;
      cantidad: number;
    } = { disponible: false, lineas: [], total: 0, cantidad: 0 };

    if (hayPagos) {
      const tP = quoteSchemaTable(schema, "pagos");
      const pagosQ = await queryWithRetry<{
        metodo: string;
        cantidad: string;
        total: string;
      }>(
        pool,
        `SELECT lower(btrim(COALESCE(metodo_pago, ''))) AS metodo,
                count(*)::text                          AS cantidad,
                COALESCE(sum(monto), 0)::text           AS total
           FROM ${tP}
          WHERE empresa_id = $1::uuid
            AND (fecha_pago AT TIME ZONE $2)::date = $3::date
          GROUP BY 1
          -- Por el importe real: ordenar por la columna 3 ordenaría el ::text
          -- y 500000 quedaría antes que 3200000.
          ORDER BY sum(monto) DESC NULLS LAST`,
        [empresaId, TZ, fecha]
      );

      const lineas = pagosQ.rows.map((r) => ({
        metodo: r.metodo,
        label: etiquetaMetodo(r.metodo),
        cantidad: num(r.cantidad),
        total: num(r.total),
      }));

      cobranzas = {
        disponible: true,
        lineas,
        total: lineas.reduce((acc, l) => acc + l.total, 0),
        cantidad: lineas.reduce((acc, l) => acc + l.cantidad, 0),
      };
    }

    return NextResponse.json(successResponse({ cierre: { fecha, ventas, cobranzas } }));
  } catch (err) {
    console.error("[/api/ventas/cierre GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo calcular el cierre."), { status: 500 });
  }
}
