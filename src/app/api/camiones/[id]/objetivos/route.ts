import type { PoolClient } from "pg";
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { puede } from "@/lib/usuarios/server/permisos-pg";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Objetivo de carga de un camión: cuánto de cada producto debería llevar cuando
 * sale (documento v0.2, pág. 6).
 *
 * Se guarda en `inventario_stock_ubicacion.stock_maximo` de la ubicación del
 * camión, que ya existía y significa exactamente eso: el tope que lleva esa
 * ubicación. No hace falta una columna nueva.
 *
 * La sugerencia es objetivo − remanente, nunca negativa: si el camión volvió
 * con más de su objetivo, no hay nada que cargar.
 */

type FilaObjetivo = {
  producto_id: string;
  nombre: string;
  unidad: string;
  objetivo: string | null;
  actual: string;
};

async function ubicacionDeCamion(
  client: { query: PoolClient["query"] },
  schema: string,
  empresaId: string,
  camionId: string
): Promise<{ alias: string; ubicacionId: string } | null> {
  const tC = quoteSchemaTable(schema, "camiones");
  const q = await client.query<{ alias: string; ubicacion_id: string | null }>(
    `SELECT alias, ubicacion_id FROM ${tC} WHERE id = $1::uuid AND empresa_id = $2::uuid`,
    [camionId, empresaId]
  );
  const row = q.rows[0];
  if (!row || !row.ubicacion_id) return null;
  return { alias: row.alias, ubicacionId: row.ubicacion_id };
}

/** GET /api/camiones/[id]/objetivos — objetivo, remanente y sugerido por producto. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const { id } = await context.params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json(errorResponse("Camión inválido."), { status: 400 });
    }

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));

    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

    const ubic = await ubicacionDeCamion(pool, schema, empresaId, id);
    if (!ubic) {
      return NextResponse.json(
        errorResponse("Ese camión no existe o no tiene ubicación de inventario."),
        { status: 404 }
      );
    }

    const tP = quoteSchemaTable(schema, "productos");
    const tSU = quoteSchemaTable(schema, "inventario_stock_ubicacion");

    // Todos los productos vendibles, tengan objetivo o no: la pantalla sirve
    // tanto para ver la sugerencia como para definir el objetivo por primera vez.
    const q = await queryWithRetry<FilaObjetivo>(
      pool,
      `SELECT p.id AS producto_id, p.nombre,
              COALESCE(NULLIF(p.unidad_medida, ''), '') AS unidad,
              su.stock_maximo::text AS objetivo,
              COALESCE(su.stock_actual, 0)::text AS actual
         FROM ${tP} p
         LEFT JOIN ${tSU} su
                ON su.producto_id = p.id AND su.ubicacion_id = $2::uuid
        WHERE p.empresa_id = $1::uuid AND p.activo = true
        ORDER BY (su.stock_maximo IS NULL), p.nombre`,
      [empresaId, ubic.ubicacionId]
    );

    const productos = q.rows.map((r) => {
      const objetivo = r.objetivo === null ? null : Number(r.objetivo);
      const actual = Number(r.actual);
      return {
        producto_id: r.producto_id,
        nombre: r.nombre,
        unidad: r.unidad,
        objetivo,
        actual,
        sugerido: objetivo === null ? 0 : Math.max(objetivo - actual, 0),
      };
    });

    return NextResponse.json(
      successResponse({ camion: ubic.alias, ubicacion_id: ubic.ubicacionId, productos })
    );
  } catch (err) {
    console.error("[/api/camiones/[id]/objetivos GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los objetivos."), { status: 500 });
  }
}

/**
 * PUT /api/camiones/[id]/objetivos — define el objetivo de cada producto.
 * Body: { items: [{producto_id, objetivo}] }
 *
 * Un objetivo vacío o 0 borra el objetivo: ese producto deja de sugerirse.
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

  let client: PoolClient | null = null;
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const { id } = await context.params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json(errorResponse("Camión inválido."), { status: 400 });
    }

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));

    if (!(await puede({ schema, empresaId, email: ctx.auth.user.email }, "reparto.objetivo"))) {
      return NextResponse.json(
        errorResponse("No tenés permiso para definir el objetivo de carga."),
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const raw = body?.items;
    if (!Array.isArray(raw)) {
      return NextResponse.json(errorResponse("Objetivos inválidos."), { status: 400 });
    }

    const items: { producto_id: string; objetivo: number | null }[] = [];
    for (const it of raw) {
      if (!it || typeof it !== "object") {
        return NextResponse.json(errorResponse("Objetivos inválidos."), { status: 400 });
      }
      const o = it as Record<string, unknown>;
      const producto_id = String(o.producto_id ?? "").trim();
      if (!UUID_RE.test(producto_id)) {
        return NextResponse.json(errorResponse("Objetivos inválidos."), { status: 400 });
      }
      const crudo = o.objetivo;
      if (crudo === null || crudo === undefined || crudo === "") {
        items.push({ producto_id, objetivo: null });
        continue;
      }
      const objetivo = Number(crudo);
      if (!Number.isFinite(objetivo) || objetivo < 0) {
        return NextResponse.json(
          errorResponse("El objetivo tiene que ser un número mayor o igual a 0."),
          { status: 400 }
        );
      }
      items.push({ producto_id, objetivo: objetivo === 0 ? null : objetivo });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const ubic = await ubicacionDeCamion(client, schema, empresaId, id);
    if (!ubic) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse("Ese camión no existe o no tiene ubicación de inventario."),
        { status: 404 }
      );
    }

    const tP = quoteSchemaTable(schema, "productos");
    const tSU = quoteSchemaTable(schema, "inventario_stock_ubicacion");

    if (items.length > 0) {
      const ids = items.map((i) => i.producto_id);
      const propios = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ${tP} WHERE empresa_id = $1::uuid AND id = ANY($2::uuid[])`,
        [empresaId, ids]
      );
      if (Number(propios.rows[0].n) !== new Set(ids).size) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          errorResponse("Hay productos que no pertenecen a esta empresa."),
          { status: 400 }
        );
      }
    }

    for (const it of items) {
      // `stock_actual` en 0 solo cuando la fila no existía: si el camión ya
      // tiene mercadería de ese producto, definir su objetivo no puede
      // borrarle el saldo.
      await client.query(
        `INSERT INTO ${tSU} (empresa_id, producto_id, ubicacion_id, stock_actual, stock_maximo)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 0, $4)
         ON CONFLICT (empresa_id, producto_id, ubicacion_id)
         DO UPDATE SET stock_maximo = EXCLUDED.stock_maximo, updated_at = now()`,
        [empresaId, it.producto_id, ubic.ubicacionId, it.objetivo]
      );
    }

    await client.query("COMMIT");
    return NextResponse.json(successResponse({ camion_id: id, objetivos: items.length }));
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[/api/camiones/[id]/objetivos PUT]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron guardar los objetivos."), {
      status: 500,
    });
  } finally {
    client?.release();
  }
}
