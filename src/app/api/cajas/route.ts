import type { PoolClient } from "pg";
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/** GET /api/cajas?estado=abierta — la caja abierta de la empresa, si hay. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

    // Sin tabla `cajas` el ERP no modela caja: se informa y la Caja decide.
    const existeQ = await queryWithRetry<{ existe: string | null }>(
      pool,
      `SELECT to_regclass($1)::text AS existe`,
      [`${schema}.cajas`]
    );
    if (existeQ.rows[0]?.existe === null) {
      return NextResponse.json(successResponse({ disponible: false, caja: null }));
    }

    const tC = quoteSchemaTable(schema, "cajas");
    const q = await queryWithRetry<{
      id: string;
      numero_caja: number;
      estado: string;
      fecha_apertura: string;
      monto_apertura: string;
    }>(
      pool,
      `SELECT id, numero_caja, estado, fecha_apertura::text AS fecha_apertura,
              monto_apertura::text AS monto_apertura
         FROM ${tC}
        WHERE empresa_id = $1::uuid AND estado = 'abierta'
        ORDER BY fecha_apertura DESC
        LIMIT 1`,
      [empresaId]
    );

    const row = q.rows[0];
    return NextResponse.json(
      successResponse({
        disponible: true,
        caja: row
          ? {
              id: row.id,
              numero_caja: Number(row.numero_caja),
              estado: "abierta" as const,
              fecha_apertura: row.fecha_apertura,
              monto_apertura: Number(row.monto_apertura),
            }
          : null,
      })
    );
  } catch (err) {
    console.error("[/api/cajas GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo consultar la caja."), { status: 500 });
  }
}

/**
 * POST /api/cajas — abre la caja del día.
 * Body: { monto_apertura }
 *
 * Sin caja abierta no se cobra de contado, así que esto es lo primero que hace
 * el cajero a la mañana. El monto de apertura es el efectivo con el que arranca
 * el cajón, y es contra eso que después cuadra el arqueo.
 *
 * Las columnas se leen del schema en vez de escribirlas fijas: el ERP se
 * despliega sobre varios schemas y no todos tienen las mismas. Si alguna
 * obligatoria no se conoce, el error la nombra en lugar de reventar con un 500.
 */
export async function POST(request: NextRequest) {
  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

  let client: PoolClient | null = null;
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const crudo = body?.monto_apertura;
    const monto = crudo === undefined || crudo === null || crudo === "" ? 0 : Number(crudo);
    if (!Number.isFinite(monto) || monto < 0) {
      return NextResponse.json(
        errorResponse("El monto de apertura tiene que ser un número mayor o igual a 0."),
        { status: 400 }
      );
    }

    const tC = quoteSchemaTable(schema, "cajas");

    client = await pool.connect();
    await client.query("BEGIN");

    const cols = await client.query<{
      columna: string;
      nullable: string;
      tiene_default: boolean;
    }>(
      `SELECT column_name AS columna, is_nullable AS nullable,
              (column_default IS NOT NULL) AS tiene_default
         FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'cajas'`,
      [schema]
    );
    if (cols.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Este schema no tiene la tabla cajas."), {
        status: 409,
      });
    }
    const existe = new Set(cols.rows.map((r) => r.columna));

    // Solo puede haber una caja abierta por empresa: con dos, una venta no
    // sabría a cuál imputarse y el arqueo de las dos quedaría mal.
    const abiertaQ = await client.query<{ numero_caja: number }>(
      `SELECT numero_caja FROM ${tC}
        WHERE empresa_id = $1::uuid AND estado = 'abierta'
        FOR UPDATE`,
      [empresaId]
    );
    if (abiertaQ.rows.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse(
          `Ya hay una caja abierta (N° ${abiertaQ.rows[0].numero_caja}). Cerrala antes de abrir otra.`
        ),
        { status: 409 }
      );
    }

    const insCols: string[] = ["empresa_id", "estado", "monto_apertura"];
    const insVals: unknown[] = [empresaId, "abierta", monto];

    if (existe.has("numero_caja")) {
      const sig = await client.query<{ n: string }>(
        `SELECT COALESCE(max(numero_caja), 0)::text AS n FROM ${tC} WHERE empresa_id = $1::uuid`,
        [empresaId]
      );
      insCols.push("numero_caja");
      insVals.push(Number(sig.rows[0].n) + 1);
    }
    if (existe.has("fecha_apertura")) {
      insCols.push("fecha_apertura");
      insVals.push(new Date().toISOString());
    }
    if (existe.has("abierta_por")) {
      insCols.push("abierta_por");
      insVals.push(ctx.auth.usuarioCatalogId ?? null);
    }
    if (existe.has("usuario_id")) {
      insCols.push("usuario_id");
      insVals.push(ctx.auth.usuarioCatalogId ?? null);
    }

    // Una columna obligatoria que no sabemos llenar rompería el INSERT con un
    // mensaje de Postgres. Mejor decir cuál es.
    const faltantes = cols.rows
      .filter(
        (r) =>
          r.nullable === "NO" &&
          !r.tiene_default &&
          r.columna !== "id" &&
          !insCols.includes(r.columna)
      )
      .map((r) => r.columna);
    if (faltantes.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse(
          `La tabla cajas de este schema exige ${faltantes.join(", ")} y la apertura no sabe qué poner ahí.`
        ),
        { status: 409 }
      );
    }

    const placeholders = insCols.map((_, i) => `$${i + 1}`);
    const alta = await client.query<{ id: string; numero_caja: number | null }>(
      `INSERT INTO ${tC} (${insCols.join(", ")}) VALUES (${placeholders.join(", ")})
       RETURNING id${existe.has("numero_caja") ? ", numero_caja" : ""}`,
      insVals
    );

    await client.query("COMMIT");
    return NextResponse.json(
      successResponse({
        caja_id: alta.rows[0].id,
        numero_caja: alta.rows[0].numero_caja ?? null,
      })
    );
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[/api/cajas POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo abrir la caja."), { status: 500 });
  } finally {
    client?.release();
  }
}
