import type { PoolClient } from "pg";
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function num(v: string | null): number {
  return v === null ? 0 : Number(v);
}

/**
 * POST /api/cajas/[id]/cerrar — cierre de caja.
 * Body: { monto_cierre_contado }
 *
 * Guarda lo que el cajero contó y, al lado, lo que el sistema esperaba:
 *
 *   esperado = apertura + ingresos(efectivo) − (egresos + retiros)(efectivo) + ajustes(efectivo)
 *
 * Solo efectivo, porque una transferencia no está en el cajón. Los movimientos
 * anulados no cuentan: esa plata no entró ni salió. Es la misma fórmula del
 * arqueo, que así queda coherente con lo que se guarda al cerrar.
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

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const crudo = body?.monto_cierre_contado;
    if (crudo === undefined || crudo === null || crudo === "") {
      return NextResponse.json(errorResponse("Contá el efectivo antes de cerrar."), {
        status: 400,
      });
    }
    const contado = Number(crudo);
    if (!Number.isFinite(contado) || contado < 0) {
      return NextResponse.json(
        errorResponse("El monto contado tiene que ser un número mayor o igual a 0."),
        { status: 400 }
      );
    }

    const tC = quoteSchemaTable(schema, "cajas");
    const tM = quoteSchemaTable(schema, "caja_movimientos");

    client = await pool.connect();
    await client.query("BEGIN");

    const cajaQ = await client.query<{
      estado: string;
      numero_caja: number;
      monto_apertura: string;
    }>(
      `SELECT estado, numero_caja, monto_apertura::text AS monto_apertura
         FROM ${tC} WHERE id = $1::uuid AND empresa_id = $2::uuid FOR UPDATE`,
      [id, empresaId]
    );
    if (cajaQ.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Caja no encontrada."), { status: 404 });
    }
    if (cajaQ.rows[0].estado === "cerrada") {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Esa caja ya está cerrada."), { status: 409 });
    }

    const movsQ = await client.query<{ tipo: string; total: string }>(
      `SELECT tipo, COALESCE(sum(monto), 0)::text AS total
         FROM ${tM}
        WHERE empresa_id = $1::uuid AND caja_id = $2::uuid
          AND anulado_at IS NULL
          AND lower(btrim(COALESCE(medio_pago, ''))) = 'efectivo'
        GROUP BY tipo`,
      [empresaId, id]
    );
    const porTipo = new Map(movsQ.rows.map((r) => [r.tipo, num(r.total)]));

    // `monto` se guarda siempre positivo y el signo lo da `tipo`.
    const esperado =
      num(cajaQ.rows[0].monto_apertura) +
      (porTipo.get("ingreso") ?? 0) -
      (porTipo.get("egreso") ?? 0) -
      (porTipo.get("retiro") ?? 0) +
      (porTipo.get("ajuste") ?? 0);

    await client.query(
      `UPDATE ${tC}
          SET estado = 'cerrada', fecha_cierre = now(),
              monto_cierre_contado = $2, monto_esperado_efectivo = $3
        WHERE id = $1::uuid`,
      [id, contado, esperado]
    );

    await client.query("COMMIT");
    return NextResponse.json(
      successResponse({
        caja_id: id,
        numero_caja: Number(cajaQ.rows[0].numero_caja),
        contado,
        esperado,
        diferencia: contado - esperado,
      })
    );
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[/api/cajas/[id]/cerrar POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cerrar la caja."), { status: 500 });
  } finally {
    client?.release();
  }
}
