import type { PoolClient } from "pg";
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { hayTablasReparto, listarRepartos } from "@/lib/repartos/server/repartos-pg";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/repartos?fecha=YYYY-MM-DD | ?abiertos=1 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));

    if (!(await hayTablasReparto(schema))) {
      return NextResponse.json(successResponse({ disponible: false, repartos: [] }));
    }

    const soloAbiertos = request.nextUrl.searchParams.get("abiertos") === "1";
    const fecha = request.nextUrl.searchParams.get("fecha")?.trim() ?? "";
    if (fecha && !FECHA_RE.test(fecha)) {
      return NextResponse.json(errorResponse("Fecha inválida: se espera YYYY-MM-DD."), {
        status: 400,
      });
    }

    const repartos = await listarRepartos({
      schema,
      empresaId,
      soloAbiertos,
      fecha: fecha || undefined,
    });
    return NextResponse.json(successResponse({ disponible: true, repartos }));
  } catch (err) {
    console.error("[/api/repartos GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los repartos."), { status: 500 });
  }
}

type ItemEntrada = { producto_id: string; cargado: number };

function parseItems(body: unknown): ItemEntrada[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { items?: unknown }).items;
  if (!Array.isArray(raw)) return null;

  const items: ItemEntrada[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") return null;
    const o = it as Record<string, unknown>;
    const producto_id = String(o.producto_id ?? "").trim();
    const cargado = Number(o.cargado);
    if (!producto_id) return null;
    if (!Number.isFinite(cargado) || cargado < 0) return null;
    // Cargar 0 de un producto es no cargarlo: se descarta en vez de guardar ruido.
    if (cargado === 0) continue;
    items.push({ producto_id, cargado });
  }
  return items;
}

/**
 * POST /api/repartos — abre un reparto con su carga inicial.
 * Body: { camion, responsable?, observaciones?, items: [{producto_id, cargado}] }
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

    if (!(await hayTablasReparto(schema))) {
      return NextResponse.json(
        errorResponse("Faltan las tablas de repartos. Corré 06_repartos.sql."),
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => null);
    const camion = String((body as { camion?: unknown })?.camion ?? "").trim();
    if (!camion) {
      return NextResponse.json(errorResponse("Indicá el camión."), { status: 400 });
    }
    const responsable =
      String((body as { responsable?: unknown })?.responsable ?? "").trim() || null;
    const observaciones =
      String((body as { observaciones?: unknown })?.observaciones ?? "").trim() || null;

    const items = parseItems(body);
    if (items === null) {
      return NextResponse.json(errorResponse("Carga inválida: revisá las cantidades."), {
        status: 400,
      });
    }
    if (items.length === 0) {
      return NextResponse.json(errorResponse("Cargá al menos un producto."), { status: 400 });
    }

    const tR = quoteSchemaTable(schema, "repartos");
    const tI = quoteSchemaTable(schema, "reparto_items");

    client = await pool.connect();
    await client.query("BEGIN");

    // El índice único de camión abierto lo garantiza en la base; acá damos el
    // mensaje entendible antes de chocar contra él.
    const abiertoQ = await client.query<{ id: string }>(
      `SELECT id FROM ${tR}
        WHERE empresa_id = $1::uuid AND estado = 'abierto' AND lower(btrim(camion)) = lower(btrim($2))
        LIMIT 1`,
      [empresaId, camion]
    );
    if (abiertoQ.rows.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse(`El camión ${camion} ya tiene un reparto abierto. Cerralo antes de abrir otro.`),
        { status: 409 }
      );
    }

    const repartoQ = await client.query<{ id: string }>(
      `INSERT INTO ${tR} (empresa_id, camion, responsable, observaciones)
       VALUES ($1::uuid, $2, $3, $4) RETURNING id`,
      [empresaId, camion, responsable, observaciones]
    );
    const repartoId = repartoQ.rows[0].id;

    for (const it of items) {
      await client.query(
        `INSERT INTO ${tI} (empresa_id, reparto_id, producto_id, cargado)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4)`,
        [empresaId, repartoId, it.producto_id, it.cargado]
      );
    }

    await client.query("COMMIT");
    return NextResponse.json(successResponse({ reparto_id: repartoId }));
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[/api/repartos POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo abrir el reparto."), { status: 500 });
  } finally {
    client?.release();
  }
}
