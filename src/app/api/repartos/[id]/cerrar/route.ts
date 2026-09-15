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

type Conteo = { producto_id: string; retornado: number; devuelto: number };

function parseConteos(body: unknown): Conteo[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { items?: unknown }).items;
  if (!Array.isArray(raw)) return null;

  const conteos: Conteo[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") return null;
    const o = it as Record<string, unknown>;
    const producto_id = String(o.producto_id ?? "").trim();
    const retornado = Number(o.retornado);
    const devuelto = o.devuelto === undefined || o.devuelto === null ? 0 : Number(o.devuelto);
    if (!producto_id || !UUID_RE.test(producto_id)) return null;
    if (!Number.isFinite(retornado) || retornado < 0) return null;
    if (!Number.isFinite(devuelto) || devuelto < 0) return null;
    conteos.push({ producto_id, retornado, devuelto });
  }
  return conteos;
}

/**
 * POST /api/repartos/[id]/cerrar
 * Body: { items: [{producto_id, retornado, devuelto?}] }
 *
 * Guarda el conteo de retorno y cierra el reparto. Exige contar TODOS los
 * productos cargados: un cierre con productos sin contar da una diferencia
 * incompleta que igual se leería como definitiva.
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
        errorResponse("Faltan las tablas de repartos. Corré 06_repartos.sql."),
        { status: 409 }
      );
    }

    const conteos = parseConteos(await request.json().catch(() => null));
    if (conteos === null) {
      return NextResponse.json(errorResponse("Conteo inválido: revisá las cantidades."), {
        status: 400,
      });
    }

    const tR = quoteSchemaTable(schema, "repartos");
    const tI = quoteSchemaTable(schema, "reparto_items");

    client = await pool.connect();
    await client.query("BEGIN");

    // FOR UPDATE: dos cierres simultáneos del mismo reparto se serializan en vez
    // de pisarse el conteo.
    const repartoQ = await client.query<{ estado: string; camion: string }>(
      `SELECT estado, camion FROM ${tR} WHERE id = $1::uuid AND empresa_id = $2::uuid FOR UPDATE`,
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

    const cargadosQ = await client.query<{ producto_id: string }>(
      `SELECT producto_id FROM ${tI} WHERE reparto_id = $1::uuid`,
      [id]
    );
    const cargados = new Set(cargadosQ.rows.map((r) => r.producto_id));
    const contados = new Set(conteos.map((c) => c.producto_id));

    const sinContar = [...cargados].filter((p) => !contados.has(p));
    if (sinContar.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse(
          `Faltan contar ${sinContar.length} ${sinContar.length === 1 ? "producto" : "productos"} antes de cerrar.`
        ),
        { status: 400 }
      );
    }

    const ajenos = conteos.filter((c) => !cargados.has(c.producto_id));
    if (ajenos.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse("Hay productos contados que no estaban en la carga de este reparto."),
        { status: 400 }
      );
    }

    for (const c of conteos) {
      await client.query(
        `UPDATE ${tI}
            SET retornado = $1, devuelto = $2, updated_at = now()
          WHERE reparto_id = $3::uuid AND producto_id = $4::uuid`,
        [c.retornado, c.devuelto, id, c.producto_id]
      );
    }

    await client.query(
      `UPDATE ${tR} SET estado = 'cerrado', cerrado_at = now(), updated_at = now()
        WHERE id = $1::uuid`,
      [id]
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
