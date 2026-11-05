import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * Metas comerciales mensuales por producto. Pedido Distribuidora JM (soporte,
 * punto 5): la clienta quiere cargar un objetivo de unidades vendidas por
 * producto por mes y ver el avance.
 *
 * Schema:
 *   metas_comerciales_mensuales (
 *     id             uuid PK default gen_random_uuid(),
 *     empresa_id     uuid not null,
 *     mes            char(7) not null,       -- YYYY-MM
 *     producto_id    uuid not null,
 *     cantidad_objetivo numeric not null check (cantidad_objetivo > 0),
 *     created_at     timestamptz default now(),
 *     unique (empresa_id, mes, producto_id)
 *   );
 *
 * La tabla se crea lazy (CREATE IF NOT EXISTS) la primera vez que se accede
 * al endpoint, así no hace falta una migración manual.
 *
 * Endpoints:
 *   GET    ?mes=YYYY-MM         Lista metas del mes con avance real (cantidad
 *                               vendida en ese mes, no anulada) y % cumplimiento.
 *   POST   { mes, producto_id, cantidad_objetivo }
 *                               Crea o actualiza (ON CONFLICT upsert).
 *   DELETE ?id=UUID             Borra una meta.
 */

async function asegurarTabla(pool: NonNullable<ReturnType<typeof getChatPostgresPool>>, schema: string) {
  const t = quoteSchemaTable(schema, "metas_comerciales_mensuales");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${t} (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id uuid NOT NULL,
      mes char(7) NOT NULL,
      producto_id uuid NOT NULL,
      cantidad_objetivo numeric NOT NULL CHECK (cantidad_objetivo > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (empresa_id, mes, producto_id)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS metas_comerciales_empresa_mes_idx ON ${t} (empresa_id, mes);`);
}

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

    const mes = (request.nextUrl.searchParams.get("mes") ?? "").trim();
    if (!MES_RE.test(mes)) {
      return NextResponse.json(errorResponse("Falta o es inválido el mes (YYYY-MM)."), { status: 400 });
    }

    await asegurarTabla(pool, schema);

    const tM = quoteSchemaTable(schema, "metas_comerciales_mensuales");
    const tP = quoteSchemaTable(schema, "productos");
    const tV = quoteSchemaTable(schema, "ventas");
    const tVI = quoteSchemaTable(schema, "ventas_items");

    // Avance real: suma de cantidades vendidas de ese producto en el mes,
    // excluyendo anuladas. Usamos un LEFT JOIN subquery para no requerir que
    // existan ventas.
    const { rows } = await queryWithRetry<{
      id: string;
      producto_id: string;
      nombre: string;
      sku: string;
      cantidad_objetivo: string;
      vendido: string;
      created_at: string;
    }>(
      pool,
      `SELECT m.id, m.producto_id, p.nombre, p.sku,
              m.cantidad_objetivo::text,
              COALESCE((
                SELECT sum(vi.cantidad)
                  FROM ${tVI} vi
                  JOIN ${tV} v ON v.id = vi.venta_id
                 WHERE v.empresa_id = $1::uuid
                   AND COALESCE(v.estado, '') <> 'anulada'
                   AND vi.producto_id = m.producto_id
                   AND to_char(v.fecha, 'YYYY-MM') = $2
              ), 0)::text AS vendido,
              m.created_at::text
         FROM ${tM} m
         JOIN ${tP} p ON p.id = m.producto_id
        WHERE m.empresa_id = $1::uuid AND m.mes = $2
        ORDER BY p.nombre`,
      [empresaId, mes]
    );

    return NextResponse.json(successResponse({
      mes,
      filas: rows.map((r) => {
        const objetivo = Number(r.cantidad_objetivo) || 0;
        const vendido = Number(r.vendido) || 0;
        return {
          id: r.id,
          producto_id: r.producto_id,
          nombre: r.nombre,
          sku: r.sku,
          cantidad_objetivo: objetivo,
          vendido,
          faltante: Math.max(0, objetivo - vendido),
          porcentaje: objetivo > 0 ? Math.round((vendido / objetivo) * 1000) / 10 : 0,
        };
      }),
    }));
  } catch (err) {
    console.error("[/api/metas-comerciales GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar las metas."), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

    const body = (await request.json().catch(() => null)) as {
      mes?: string;
      producto_id?: string;
      cantidad_objetivo?: number | string;
    } | null;
    if (!body) return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });

    const mes = String(body.mes ?? "").trim();
    const productoId = String(body.producto_id ?? "").trim();
    const cantidad = Number(body.cantidad_objetivo);

    if (!MES_RE.test(mes)) return NextResponse.json(errorResponse("Mes inválido (YYYY-MM)."), { status: 400 });
    if (!UUID_RE.test(productoId)) return NextResponse.json(errorResponse("Producto inválido."), { status: 400 });
    if (!(cantidad > 0)) return NextResponse.json(errorResponse("La cantidad objetivo tiene que ser mayor a 0."), { status: 400 });

    await asegurarTabla(pool, schema);

    const tM = quoteSchemaTable(schema, "metas_comerciales_mensuales");
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO ${tM} (empresa_id, mes, producto_id, cantidad_objetivo)
       VALUES ($1::uuid, $2, $3::uuid, $4::numeric)
       ON CONFLICT (empresa_id, mes, producto_id)
       DO UPDATE SET cantidad_objetivo = EXCLUDED.cantidad_objetivo
       RETURNING id`,
      [empresaId, mes, productoId, cantidad]
    );
    return NextResponse.json(successResponse({ id: rows[0].id }));
  } catch (err) {
    console.error("[/api/metas-comerciales POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo guardar la meta."), { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

    const id = (request.nextUrl.searchParams.get("id") ?? "").trim();
    if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("Id inválido."), { status: 400 });

    const tM = quoteSchemaTable(schema, "metas_comerciales_mensuales");
    await pool.query(`DELETE FROM ${tM} WHERE id = $1::uuid AND empresa_id = $2::uuid`, [id, empresaId]);
    return NextResponse.json(successResponse({ ok: true }));
  } catch (err) {
    console.error("[/api/metas-comerciales DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo borrar la meta."), { status: 500 });
  }
}
