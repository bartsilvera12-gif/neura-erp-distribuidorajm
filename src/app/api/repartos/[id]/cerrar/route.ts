import type { PoolClient } from "pg";
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { hayTablasReparto } from "@/lib/repartos/server/repartos-pg";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/repartos/[id]/cerrar
 * Body: { merma_kg?, notas_cierre? }
 *
 * El cierre no cuenta producto por producto: el reparto guarda una merma total
 * (`repartos.merma_kg`), que es lo que se declara al volver al depósito.
 *
 * Antes de cerrar consolida `reparto_stock.cantidad_vendida` con lo realmente
 * vendido en ese reparto. Esa columna es un acumulado que la venta mantiene en
 * caliente; al cerrar se la recalcula desde `ventas` para que el histórico
 * quede firme aunque algo la haya dejado atrasada.
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
      return NextResponse.json(errorResponse("Reparto inválido."), { status: 400 });
    }

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    if (!(await hayTablasReparto(schema))) {
      return NextResponse.json(
        errorResponse("Este schema no tiene el dominio de repartos (repartos / reparto_stock)."),
        { status: 409 }
      );
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

    const crudo = body?.merma_kg;
    const merma = crudo === undefined || crudo === null || crudo === "" ? 0 : Number(crudo);
    if (!Number.isFinite(merma) || merma < 0) {
      return NextResponse.json(errorResponse("La merma tiene que ser un número mayor o igual a 0."), {
        status: 400,
      });
    }
    const notas = String(body?.notas_cierre ?? "").trim() || null;

    const tR = quoteSchemaTable(schema, "repartos");
    const tS = quoteSchemaTable(schema, "reparto_stock");
    const tV = quoteSchemaTable(schema, "ventas");
    const tVI = quoteSchemaTable(schema, "ventas_items");

    client = await pool.connect();
    await client.query("BEGIN");

    // FOR UPDATE: dos cierres simultáneos del mismo reparto se serializan en
    // vez de pisarse.
    const repartoQ = await client.query<{ estado: string }>(
      `SELECT estado FROM ${tR} WHERE id = $1::uuid AND empresa_id = $2::uuid FOR UPDATE`,
      [id, empresaId]
    );
    if (repartoQ.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Reparto no encontrado."), { status: 404 });
    }
    if (repartoQ.rows[0].estado === "cerrado") {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Ese reparto ya está cerrado."), { status: 409 });
    }

    await client.query(
      `UPDATE ${tS} rs
          SET cantidad_vendida = COALESCE((
                SELECT sum(vi.cantidad)
                  FROM ${tVI} vi
                  JOIN ${tV} v ON v.id = vi.venta_id
                 WHERE v.reparto_id = rs.reparto_id
                   AND vi.producto_id = rs.producto_id
                   AND COALESCE(v.estado, '') <> 'anulada'
              ), 0),
              updated_at = now()
        WHERE rs.reparto_id = $1::uuid`,
      [id]
    );

    await client.query(
      `UPDATE ${tR}
          SET estado = 'cerrado', cerrado_at = now(), merma_kg = $2, notas_cierre = $3,
              updated_at = now()
        WHERE id = $1::uuid`,
      [id, merma, notas]
    );

    await client.query("COMMIT");
    return NextResponse.json(successResponse({ reparto_id: id, estado: "cerrado" }));
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[/api/repartos/[id]/cerrar POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cerrar el reparto."), { status: 500 });
  } finally {
    client?.release();
  }
}
