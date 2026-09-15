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
 * POST /api/camiones — da de alta un camión.
 * Body: { alias, patente? }
 *
 * El alias es lo que se ve en la Caja y en el control de mercadería, así que
 * no puede repetirse dentro de la empresa: dos "01" harían imposible saber de
 * cuál salió una venta.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));

    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

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

    const repetido = await queryWithRetry<{ id: string; activo: boolean }>(
      pool,
      `SELECT id, activo FROM ${tC}
        WHERE empresa_id = $1::uuid AND lower(btrim(alias)) = lower(btrim($2))
        LIMIT 1`,
      [empresaId, alias]
    );
    if (repetido.rows.length > 0) {
      return NextResponse.json(
        errorResponse(
          repetido.rows[0].activo
            ? `Ya hay un camión ${alias}.`
            : `Ya hay un camión ${alias}, dado de baja. Reactivalo en vez de crear otro.`
        ),
        { status: 409 }
      );
    }

    const alta = await queryWithRetry<{ id: string }>(
      pool,
      `INSERT INTO ${tC} (empresa_id, alias, patente) VALUES ($1::uuid, $2, $3) RETURNING id`,
      [empresaId, alias, patente]
    );

    return NextResponse.json(successResponse({ camion_id: alta.rows[0].id }));
  } catch (err) {
    console.error("[/api/camiones POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo dar de alta el camión."), { status: 500 });
  }
}
