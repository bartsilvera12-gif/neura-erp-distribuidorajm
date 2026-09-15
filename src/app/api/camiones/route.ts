import type { PoolClient } from "pg";
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { listarCamiones } from "@/lib/repartos/server/repartos-pg";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { queryWithRetry } from "@/lib/supabase/pg-retry";

/**
 * GET /api/camiones — camiones activos, para el alta del reparto.
 * Con `?todos=1` vienen también los dados de baja, para administrarlos.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));

    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(successResponse({ camiones: [] }));

    // Un schema sin `camiones` devuelve la lista vacía en vez de romper: la
    // pantalla ya sabe mostrar "no hay camiones cargados".
    const existe = await queryWithRetry<{ t: string | null }>(
      pool,
      `SELECT to_regclass($1)::text AS t`,
      [`${schema}.camiones`]
    );
    if (!existe.rows[0]?.t) {
      return NextResponse.json(successResponse({ camiones: [] }));
    }

    const camiones = await listarCamiones({
      schema,
      empresaId,
      incluirInactivos: request.nextUrl.searchParams.get("todos") === "1",
    });
    return NextResponse.json(successResponse({ camiones }));
  } catch (err) {
    console.error("[/api/camiones GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los camiones."), { status: 500 });
  }
}

/**
 * POST /api/camiones — da de alta un camión con su ubicación de inventario.
 * Body: { alias, patente? }
 *
 * El camión no es solo un dato: es una ubicación de stock. Por eso el alta crea
 * también su fila en `inventario_ubicaciones` y las dos cosas van en la misma
 * transacción — un camión sin ubicación no podría cargar ni vender, y una
 * ubicación huérfana quedaría suelta en el inventario.
 *
 * El alias no puede repetirse dentro de la empresa: dos "01" harían imposible
 * saber de cuál salió una venta.
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
    const alias = String(body?.alias ?? "").trim();
    if (!alias) {
      return NextResponse.json(errorResponse("Poné un nombre o número de camión."), { status: 400 });
    }
    if (alias.length > 60) {
      return NextResponse.json(errorResponse("El nombre del camión es demasiado largo."), {
        status: 400,
      });
    }
    const patente = String(body?.patente ?? "").trim().toUpperCase() || null;

    const tC = quoteSchemaTable(schema, "camiones");
    const tU = quoteSchemaTable(schema, "inventario_ubicaciones");

    client = await pool.connect();
    await client.query("BEGIN");

    const repetido = await client.query<{ id: string; activo: boolean }>(
      `SELECT id, activo FROM ${tC}
        WHERE empresa_id = $1::uuid AND lower(btrim(alias)) = lower(btrim($2))
        LIMIT 1`,
      [empresaId, alias]
    );
    if (repetido.rows.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse(
          repetido.rows[0].activo
            ? `Ya hay un camión ${alias}.`
            : `Ya hay un camión ${alias}, dado de baja. Reactivalo en vez de crear otro.`
        ),
        { status: 409 }
      );
    }

    const ubic = await client.query<{ id: string }>(
      `INSERT INTO ${tU} (empresa_id, nombre, tipo, activo)
       VALUES ($1::uuid, $2, 'camion', true) RETURNING id`,
      [empresaId, `Camión ${alias}`]
    );

    const alta = await client.query<{ id: string }>(
      `INSERT INTO ${tC} (empresa_id, alias, patente, ubicacion_id)
       VALUES ($1::uuid, $2, $3, $4::uuid) RETURNING id`,
      [empresaId, alias, patente, ubic.rows[0].id]
    );

    await client.query("COMMIT");
    return NextResponse.json(
      successResponse({ camion_id: alta.rows[0].id, ubicacion_id: ubic.rows[0].id })
    );
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/camiones POST]", msg);
    // Si todavía no corrieron la migración 09, el mensaje genérico no ayudaría.
    if (/ubicacion_id|inventario_ubicaciones|tipo_check/i.test(msg)) {
      return NextResponse.json(
        errorResponse(
          "Falta la migración del stock móvil (09_stock_movil.sql): el camión no puede tener su ubicación de inventario."
        ),
        { status: 409 }
      );
    }
    return NextResponse.json(errorResponse("No se pudo dar de alta el camión."), { status: 500 });
  } finally {
    client?.release();
  }
}
