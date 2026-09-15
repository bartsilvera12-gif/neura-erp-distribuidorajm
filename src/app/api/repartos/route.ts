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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SIN_TABLAS = "Este schema no tiene el dominio de repartos (repartos / reparto_stock).";

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

type ItemEntrada = { producto_id: string; cantidad_inicial: number };

function parseItems(body: unknown): ItemEntrada[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { items?: unknown }).items;
  if (!Array.isArray(raw)) return null;

  const items = new Map<string, number>();
  for (const it of raw) {
    if (!it || typeof it !== "object") return null;
    const o = it as Record<string, unknown>;
    const producto_id = String(o.producto_id ?? "").trim();
    const cantidad = Number(o.cantidad_inicial);
    if (!UUID_RE.test(producto_id)) return null;
    if (!Number.isFinite(cantidad) || cantidad < 0) return null;
    // Cargar 0 de un producto es no cargarlo: se descarta en vez de guardar ruido.
    if (cantidad === 0) continue;
    // `reparto_stock` es único por (reparto_id, producto_id): si el formulario
    // mandó el mismo producto dos veces, se suma en vez de chocar contra el índice.
    items.set(producto_id, (items.get(producto_id) ?? 0) + cantidad);
  }
  return [...items].map(([producto_id, cantidad_inicial]) => ({ producto_id, cantidad_inicial }));
}

/**
 * POST /api/repartos — abre un reparto con la carga del camión.
 * Body: { camion_id, repartidor_id, fecha?, items: [{producto_id, cantidad_inicial}] }
 *
 * No mueve el stock del depósito: la salida se descuenta cuando la venta se
 * confirma. Descontarla también acá contaría dos veces la misma mercadería.
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
      return NextResponse.json(errorResponse(SIN_TABLAS), { status: 409 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

    const camionId = String(body?.camion_id ?? "").trim();
    if (!UUID_RE.test(camionId)) {
      return NextResponse.json(errorResponse("Elegí el camión."), { status: 400 });
    }
    const repartidorId = String(body?.repartidor_id ?? "").trim();
    if (!UUID_RE.test(repartidorId)) {
      return NextResponse.json(errorResponse("Elegí el repartidor."), { status: 400 });
    }
    const fecha = String(body?.fecha ?? "").trim();
    if (fecha && !FECHA_RE.test(fecha)) {
      return NextResponse.json(errorResponse("Fecha inválida: se espera YYYY-MM-DD."), {
        status: 400,
      });
    }

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
    const tC = quoteSchemaTable(schema, "camiones");
    const tU = quoteSchemaTable(schema, "usuarios");
    const tP = quoteSchemaTable(schema, "productos");
    const tS = quoteSchemaTable(schema, "reparto_stock");

    client = await pool.connect();
    await client.query("BEGIN");

    const camionQ = await client.query<{ alias: string; activo: boolean }>(
      `SELECT alias, activo FROM ${tC} WHERE id = $1::uuid AND empresa_id = $2::uuid`,
      [camionId, empresaId]
    );
    if (camionQ.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Ese camión no existe en esta empresa."), {
        status: 400,
      });
    }
    if (!camionQ.rows[0].activo) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Ese camión está dado de baja."), { status: 400 });
    }
    const alias = camionQ.rows[0].alias;

    const repartidorQ = await client.query<{ ok: number }>(
      `SELECT 1 AS ok FROM ${tU} WHERE id = $1::uuid AND empresa_id = $2::uuid`,
      [repartidorId, empresaId]
    );
    if (repartidorQ.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Ese repartidor no existe en esta empresa."), {
        status: 400,
      });
    }

    // Un camión no puede tener dos repartos abiertos: las ventas se estampan
    // con un reparto y no se sabría a cuál de los dos descontarle la carga.
    // La tabla no tiene índice parcial que lo impida, así que se valida acá,
    // dentro de la transacción y bloqueando las filas del camión.
    const abiertoQ = await client.query<{ id: string }>(
      `SELECT id FROM ${tR}
        WHERE empresa_id = $1::uuid AND camion_id = $2::uuid AND estado = 'abierto'
        FOR UPDATE`,
      [empresaId, camionId]
    );
    if (abiertoQ.rows.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse(`El camión ${alias} ya tiene un reparto abierto. Cerralo antes de abrir otro.`),
        { status: 409 }
      );
    }

    // La unidad se toma del producto y no del cliente: `reparto_stock.unidad_medida`
    // es NOT NULL y tiene que coincidir con la del inventario para que el
    // esperado se pueda comparar contra lo que vuelve.
    const unidadesQ = await client.query<{ id: string; unidad_medida: string | null }>(
      `SELECT id, unidad_medida FROM ${tP}
        WHERE empresa_id = $1::uuid AND id = ANY($2::uuid[])`,
      [empresaId, items.map((i) => i.producto_id)]
    );
    if (unidadesQ.rows.length !== items.length) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse("Hay productos en la carga que no pertenecen a esta empresa."),
        { status: 400 }
      );
    }
    const unidades = new Map(unidadesQ.rows.map((r) => [r.id, r.unidad_medida ?? "UN"]));

    const repartoQ = await client.query<{ id: string }>(
      `INSERT INTO ${tR} (empresa_id, camion_id, repartidor_id, fecha)
       VALUES ($1::uuid, $2::uuid, $3::uuid, COALESCE($4::date, (now() AT TIME ZONE 'America/Asuncion')::date))
       RETURNING id`,
      [empresaId, camionId, repartidorId, fecha || null]
    );
    const repartoId = repartoQ.rows[0].id;

    for (const it of items) {
      await client.query(
        `INSERT INTO ${tS} (empresa_id, reparto_id, producto_id, unidad_medida, cantidad_inicial)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)`,
        [empresaId, repartoId, it.producto_id, unidades.get(it.producto_id) || "UN", it.cantidad_inicial]
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
