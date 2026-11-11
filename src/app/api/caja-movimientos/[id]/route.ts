import type { PoolClient } from "pg";
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEDIOS = new Set(["efectivo", "transferencia", "tarjeta", "cheque", "otro"]);

/**
 * PATCH /api/caja-movimientos/[id] — edita un movimiento manual de caja.
 *
 * Solo admin (rol admin_empresa). Solo movimientos cargados a mano: los que
 * vienen de ventas o devoluciones no se editan — se corrigen anulando la
 * venta o cargando un ajuste. Se pueden editar monto, concepto y medio de
 * pago; la fecha y el tipo (ingreso/egreso) no se tocan: cambiarlos movería
 * el movimiento de caja y rompería el cierre.
 *
 * Si la caja ya está cerrada el cambio se permite igual (el admin asume que
 * recalcula el cierre si hace falta). El arqueo que lea después va a tomar el
 * nuevo importe automáticamente.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

  let client: PoolClient | null = null;
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    if (!esRolAdminEmpresaOGlobal(ctx.auth.rol)) {
      return NextResponse.json(
        errorResponse("Solo un administrador puede editar movimientos de caja."),
        { status: 403 }
      );
    }

    const { id } = await context.params;
    if (!UUID.test(id)) {
      return NextResponse.json(errorResponse("Movimiento inválido."), { status: 400 });
    }

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const tM = quoteSchemaTable(schema, "caja_movimientos");

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json(errorResponse("Body vacío."), { status: 400 });

    const nuevos: { concepto?: string; monto?: number; medio_pago?: string } = {};
    if (typeof body.concepto === "string") {
      const c = body.concepto.trim();
      if (c === "") return NextResponse.json(errorResponse("El concepto no puede quedar vacío."), { status: 400 });
      nuevos.concepto = c;
    }
    if (body.monto !== undefined) {
      const n = Number(body.monto);
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json(errorResponse("El monto tiene que ser mayor a 0."), { status: 400 });
      }
      nuevos.monto = n;
    }
    if (typeof body.medio_pago === "string" && body.medio_pago.trim() !== "") {
      const m = body.medio_pago.trim().toLowerCase();
      if (!MEDIOS.has(m)) {
        return NextResponse.json(errorResponse("Medio de pago desconocido."), { status: 400 });
      }
      nuevos.medio_pago = m;
    }
    if (Object.keys(nuevos).length === 0) {
      return NextResponse.json(errorResponse("No mandaste ningún cambio."), { status: 400 });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const movQ = await client.query<{
      id: string;
      venta_id: string | null;
      devolucion_id: string | null;
      anulado_at: string | null;
    }>(
      `SELECT id, venta_id, devolucion_id, anulado_at
         FROM ${tM}
        WHERE id = $1::uuid AND empresa_id = $2::uuid
        FOR UPDATE`,
      [id, empresaId]
    );
    if (movQ.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Movimiento no encontrado."), { status: 404 });
    }
    const m = movQ.rows[0];
    if (m.venta_id || m.devolucion_id) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse("Este movimiento viene de una venta o devolución y no se edita acá. Anulá la venta para corregirlo."),
        { status: 409 }
      );
    }
    if (m.anulado_at) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("El movimiento ya fue anulado."), { status: 409 });
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    if (nuevos.concepto !== undefined) { params.push(nuevos.concepto); sets.push(`concepto = $${params.length}`); }
    if (nuevos.monto !== undefined)    { params.push(nuevos.monto);    sets.push(`monto = $${params.length}::numeric`); }
    if (nuevos.medio_pago !== undefined){ params.push(nuevos.medio_pago); sets.push(`medio_pago = $${params.length}`); }
    params.push(id, empresaId);
    await client.query(
      `UPDATE ${tM} SET ${sets.join(", ")}
        WHERE id = $${params.length - 1}::uuid AND empresa_id = $${params.length}::uuid`,
      params
    );

    await client.query("COMMIT");
    return NextResponse.json(successResponse({ movimiento_id: id, cambios: nuevos }));
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[/api/caja-movimientos/[id] PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo editar el movimiento."), { status: 500 });
  } finally {
    client?.release();
  }
}
