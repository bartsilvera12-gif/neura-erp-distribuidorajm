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

/**
 * POST /api/repartos — abre la jornada del camión.
 * Body: { camion_id, repartidor_id, fecha? }
 *
 * No se carga mercadería a mano: el camión ya tiene su stock, que es el
 * remanente del cierre anterior (documento v0.2, paso 1 del ciclo diario). La
 * apertura solo saca la foto de ese saldo en `reparto_stock.cantidad_inicial`,
 * para después poder decir con cuánto salió.
 *
 * Reponer se hace con la carga de proveedor, que es otro documento.
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

    const tR = quoteSchemaTable(schema, "repartos");
    const tC = quoteSchemaTable(schema, "camiones");
    const tU = quoteSchemaTable(schema, "usuarios");
    const tP = quoteSchemaTable(schema, "productos");
    const tS = quoteSchemaTable(schema, "reparto_stock");
    const tSU = quoteSchemaTable(schema, "inventario_stock_ubicacion");

    client = await pool.connect();
    await client.query("BEGIN");

    const camionQ = await client.query<{
      alias: string;
      activo: boolean;
      ubicacion_id: string | null;
    }>(
      `SELECT alias, activo, ubicacion_id FROM ${tC}
        WHERE id = $1::uuid AND empresa_id = $2::uuid`,
      [camionId, empresaId]
    );
    if (camionQ.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Ese camión no existe en esta empresa."), {
        status: 400,
      });
    }
    const { alias, activo, ubicacion_id: ubicacionId } = camionQ.rows[0];
    if (!activo) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Ese camión está dado de baja."), { status: 400 });
    }
    if (!ubicacionId) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse(
          `El camión ${alias} no tiene ubicación de inventario. Corré 09_stock_movil.sql para vincularlo.`
        ),
        { status: 409 }
      );
    }

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

    // Un camión no puede tener dos repartos abiertos: las ventas se estampan con
    // un reparto y no se sabría a cuál de los dos atribuir el movimiento. La
    // tabla no tiene índice parcial que lo impida, así que se valida acá,
    // bloqueando las filas del camión dentro de la transacción.
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

    const repartoQ = await client.query<{ id: string }>(
      `INSERT INTO ${tR} (empresa_id, camion_id, repartidor_id, fecha)
       VALUES ($1::uuid, $2::uuid, $3::uuid,
               COALESCE($4::date, (now() AT TIME ZONE 'America/Asuncion')::date))
       RETURNING id`,
      [empresaId, camionId, repartidorId, fecha || null]
    );
    const repartoId = repartoQ.rows[0].id;

    // La foto del saldo con el que arranca la jornada. Los saldos en 0 no se
    // fotografían: serían filas de ruido en el control de mercadería.
    const foto = await client.query<{ n: string }>(
      `WITH copiado AS (
         INSERT INTO ${tS} (empresa_id, reparto_id, producto_id, unidad_medida, cantidad_inicial)
         SELECT $1::uuid, $2::uuid, su.producto_id,
                COALESCE(NULLIF(p.unidad_medida, ''), 'Unidad'), su.stock_actual
           FROM ${tSU} su
           JOIN ${tP} p ON p.id = su.producto_id
          WHERE su.empresa_id = $1::uuid AND su.ubicacion_id = $3::uuid
            AND su.stock_actual > 0
         RETURNING 1
       )
       SELECT count(*)::text AS n FROM copiado`,
      [empresaId, repartoId, ubicacionId]
    );

    await client.query("COMMIT");
    return NextResponse.json(
      successResponse({ reparto_id: repartoId, productos: Number(foto.rows[0]?.n ?? 0) })
    );
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[/api/repartos POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo abrir el reparto."), { status: 500 });
  } finally {
    client?.release();
  }
}
