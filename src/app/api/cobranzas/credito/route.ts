import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { usuarioDelSchema } from "@/lib/repartos/server/repartos-pg";
import { alcanceRepartos } from "@/lib/usuarios/erp-rol-normalize";

const TZ = "America/Asuncion";

/**
 * GET /api/cobranzas/credito — lo que falta cobrar de las ventas a crédito.
 *
 * La deuda no sale de una tabla de facturas: sale de la venta misma. Una venta
 * a crédito queda con su total, y lo cobrado son los ingresos de caja
 * imputados a ella. Saldo = total − cobrado, y no hay una segunda cuenta que
 * pueda diferir de la primera.
 *
 * El cobro entra por `caja_movimientos`, así que la plata cobrada en la ruta
 * aparece sola en el arqueo del día sin que nadie la cargue dos veces.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

    const existe = await queryWithRetry<{ v: string | null; m: string | null }>(
      pool,
      `SELECT to_regclass($1)::text AS v, to_regclass($2)::text AS m`,
      [`${schema}.ventas`, `${schema}.caja_movimientos`]
    );
    if (!existe.rows[0]?.v) {
      return NextResponse.json(successResponse({ disponible: false, clientes: [] }));
    }
    const hayCaja = existe.rows[0]?.m != null;

    // Nombre y teléfono del cliente según lo que tenga la tabla en este schema.
    const colsQ = await queryWithRetry<{ tabla: string; columna: string }>(
      pool,
      `SELECT table_name AS tabla, column_name AS columna
         FROM information_schema.columns
        WHERE table_schema = $1 AND table_name IN ('clientes', 'ventas')`,
      [schema]
    );
    const colCliente = new Set(
      colsQ.rows.filter((r) => r.tabla === "clientes").map((r) => r.columna)
    );
    const colVenta = new Set(colsQ.rows.filter((r) => r.tabla === "ventas").map((r) => r.columna));

    const candidatos = ["razon_social", "nombre", "empresa", "nombre_contacto"].filter((c) =>
      colCliente.has(c)
    );
    const exprNombre =
      candidatos.length > 0
        ? `COALESCE(${candidatos.map((c) => `NULLIF(btrim(c.${c}), '')`).join(", ")}, 'Sin nombre')`
        : `'Sin nombre'`;
    const exprTelefono = colCliente.has("telefono") ? "c.telefono" : "NULL::text";

    // El vendedor móvil cobra lo suyo: las ventas que salieron de sus repartos.
    const yo = await usuarioDelSchema({ schema, empresaId, email: ctx.auth.user?.email, catalogId: ctx.auth.usuarioCatalogId ?? null });
    const soloPropias =
      alcanceRepartos(yo?.rol) === "propios" && yo !== null && colVenta.has("reparto_id");
    const filtroPropias = soloPropias
      ? ` AND v.reparto_id IN (SELECT id FROM ${quoteSchemaTable(schema, "repartos")}
                                WHERE empresa_id = $1::uuid AND repartidor_id = $2::uuid)`
      : "";

    const cobrado = hayCaja
      ? `COALESCE((SELECT sum(m.monto) FROM ${quoteSchemaTable(schema, "caja_movimientos")} m
                    WHERE m.venta_id = v.id AND m.tipo = 'ingreso' AND m.anulado_at IS NULL), 0)`
      : "0";

    const q = await queryWithRetry<{
      id: string;
      numero_control: string;
      fecha: string;
      vencimiento: string;
      plazo_dias: number | null;
      total: string;
      cobrado: string;
      cliente_id: string | null;
      cliente: string;
      telefono: string | null;
      dias: number;
    }>(
      pool,
      `SELECT v.id,
              v.numero_control,
              (v.fecha AT TIME ZONE $${soloPropias ? 3 : 2})::date::text AS fecha,
              ((v.fecha AT TIME ZONE $${soloPropias ? 3 : 2})::date
                 + COALESCE(v.plazo_dias, 0))::text AS vencimiento,
              v.plazo_dias,
              v.total::text AS total,
              ${cobrado}::text AS cobrado,
              v.cliente_id,
              ${exprNombre} AS cliente,
              ${exprTelefono} AS telefono,
              ((now() AT TIME ZONE $${soloPropias ? 3 : 2})::date
                 - ((v.fecha AT TIME ZONE $${soloPropias ? 3 : 2})::date
                    + COALESCE(v.plazo_dias, 0)))::int AS dias
         FROM ${quoteSchemaTable(schema, "ventas")} v
         LEFT JOIN ${quoteSchemaTable(schema, "clientes")} c ON c.id = v.cliente_id
        WHERE v.empresa_id = $1::uuid
          AND v.tipo_venta = 'CREDITO'
          AND COALESCE(v.estado, '') <> 'anulada'
          ${filtroPropias}
        ORDER BY 4, v.numero_control`,
      soloPropias ? [empresaId, yo!.id, TZ] : [empresaId, TZ]
    );

    type VentaCobranza = {
      id: string;
      numero_control: string;
      fecha: string;
      vencimiento: string;
      total: number;
      cobrado: number;
      saldo: number;
      /** Días desde el vencimiento: negativo = todavía no vence. */
      dias_vencida: number;
    };

    const porCliente = new Map<
      string,
      {
        cliente_id: string | null;
        cliente: string;
        telefono: string | null;
        saldo: number;
        vencido: number;
        ventas: VentaCobranza[];
      }
    >();

    for (const r of q.rows) {
      const total = Number(r.total);
      const cob = Number(r.cobrado);
      const saldo = total - cob;
      // Una venta ya cobrada no es cobranza: deja de aparecer sola.
      if (!(saldo > 0.5)) continue;

      const key = r.cliente_id ?? `sin-cliente:${r.cliente}`;
      const g = porCliente.get(key) ?? {
        cliente_id: r.cliente_id,
        cliente: r.cliente,
        telefono: r.telefono,
        saldo: 0,
        vencido: 0,
        ventas: [] as VentaCobranza[],
      };
      g.saldo += saldo;
      if (r.dias > 0) g.vencido += saldo;
      g.ventas.push({
        id: r.id,
        numero_control: r.numero_control,
        fecha: r.fecha,
        vencimiento: r.vencimiento,
        total,
        cobrado: cob,
        saldo,
        dias_vencida: r.dias,
      });
      porCliente.set(key, g);
    }

    const clientes = [...porCliente.values()].sort((a, b) => b.vencido - a.vencido || b.saldo - a.saldo);
    const resumen = {
      total: clientes.reduce((acc, c) => acc + c.saldo, 0),
      vencido: clientes.reduce((acc, c) => acc + c.vencido, 0),
      clientes: clientes.length,
      ventas: clientes.reduce((acc, c) => acc + c.ventas.length, 0),
    };

    return NextResponse.json(
      successResponse({ disponible: true, alcance: soloPropias ? "propias" : "todas", resumen, clientes })
    );
  } catch (err) {
    console.error("[/api/cobranzas/credito GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar la cobranza."), { status: 500 });
  }
}
