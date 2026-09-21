import type { PoolClient } from "pg";
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { puede } from "@/lib/usuarios/server/permisos-pg";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lo que se puede cargar a mano. Un cobro no está acá: eso lo escribe la venta. */
const TIPOS = new Set(["ingreso", "egreso", "retiro", "ajuste"]);
const MEDIOS = new Set(["efectivo", "transferencia", "tarjeta", "cheque", "otro"]);

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * POST /api/cajas/[id]/movimientos — carga un movimiento a mano.
 * Body: { tipo, concepto, monto, medio_pago }
 *
 * Es la plata que entra o sale del cajón sin pasar por una venta: el retiro
 * para cargar combustible, el adelanto al ayudante, el vuelto que faltaba. Sin
 * esto el arqueo cierra con una diferencia que nadie sabe explicar al otro día.
 *
 * `monto` se guarda siempre positivo y el signo lo pone `tipo`, igual que los
 * movimientos que escribe la venta: es lo que el cierre y el arqueo asumen para
 * calcular el efectivo esperado.
 *
 * Solo sobre una caja abierta. Tocar una caja cerrada cambiaría un arqueo ya
 * firmado, y eso es un ajuste contable, no una carga de mostrador.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

  let client: PoolClient | null = null;
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const { id } = await context.params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json(errorResponse("Caja inválida."), { status: 400 });
    }

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));

    if (!(await puede({ schema, empresaId, email: ctx.auth.user.email }, "caja.movimiento"))) {
      return NextResponse.json(
        errorResponse("No tenés permiso para cargar movimientos de caja."),
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

    const tipo = texto(body?.tipo).toLowerCase();
    if (!TIPOS.has(tipo)) {
      return NextResponse.json(
        errorResponse("El tipo tiene que ser ingreso, egreso, retiro o ajuste."),
        { status: 400 }
      );
    }

    const concepto = texto(body?.concepto);
    if (concepto === "") {
      return NextResponse.json(
        errorResponse("Poné para qué es el movimiento: sin concepto no sirve al cerrar."),
        { status: 400 }
      );
    }

    const monto = Number(body?.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      return NextResponse.json(errorResponse("El monto tiene que ser mayor a 0."), { status: 400 });
    }

    const medio = texto(body?.medio_pago).toLowerCase() || "efectivo";
    if (!MEDIOS.has(medio)) {
      return NextResponse.json(errorResponse("Medio de pago desconocido."), { status: 400 });
    }

    const tC = quoteSchemaTable(schema, "cajas");
    const tM = quoteSchemaTable(schema, "caja_movimientos");

    client = await pool.connect();
    await client.query("BEGIN");

    const cajaQ = await client.query<{ estado: string }>(
      `SELECT estado FROM ${tC}
        WHERE id = $1::uuid AND empresa_id = $2::uuid
        FOR UPDATE`,
      [id, empresaId]
    );
    if (cajaQ.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Caja no encontrada."), { status: 404 });
    }
    if (cajaQ.rows[0].estado === "cerrada") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse("Esa caja ya está cerrada: no se le pueden cargar movimientos."),
        { status: 409 }
      );
    }

    const alta = await client.query<{ id: string }>(
      `INSERT INTO ${tM} (empresa_id, caja_id, tipo, concepto, monto, medio_pago)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::numeric, $6)
       RETURNING id`,
      [empresaId, id, tipo, concepto, monto, medio]
    );

    await client.query("COMMIT");
    return NextResponse.json(
      successResponse({ movimiento_id: alta.rows[0].id, tipo, concepto, monto, medio_pago: medio })
    );
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[/api/cajas/[id]/movimientos POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo registrar el movimiento."), { status: 500 });
  } finally {
    client?.release();
  }
}
