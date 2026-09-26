import type { PoolClient } from "pg";
import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { puede } from "@/lib/usuarios/server/permisos-pg";
import {
  hayTablasReparto,
  listarRepartos,
  usuarioDelSchema,
} from "@/lib/repartos/server/repartos-pg";
import { alcanceRepartos } from "@/lib/usuarios/erp-rol-normalize";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SIN_TABLAS = "Este schema no tiene el dominio de repartos (repartos / reparto_stock).";

/** `true` si la tabla existe en el schema. */
async function tablaExiste(
  client: { query: PoolClient["query"] },
  schema: string,
  tabla: string
): Promise<boolean> {
  const q = await client.query<{ existe: string | null }>(
    `SELECT to_regclass($1)::text AS existe`,
    [`${schema}.${tabla}`]
  );
  return q.rows[0]?.existe !== null;
}

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

    // El vendedor móvil solo ve los suyos. Se decide en el servidor: ocultarlos
    // solo en la pantalla dejaría la API abierta.
    const yo = await usuarioDelSchema({ schema, empresaId, email: ctx.auth.user.email, catalogId: ctx.auth.usuarioCatalogId ?? null });
    const soloDe = alcanceRepartos(yo?.rol) === "propios" ? (yo?.id ?? null) : null;

    const repartos = await listarRepartos({
      schema,
      empresaId,
      soloAbiertos,
      fecha: fecha || undefined,
      soloDe,
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
    if (!(await puede({ schema, empresaId, email: ctx.auth.user.email }, "reparto.abrir"))) {
      return NextResponse.json(errorResponse("No tenés permiso para abrir repartos."), { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

    const camionId = String(body?.camion_id ?? "").trim();
    if (!UUID_RE.test(camionId)) {
      return NextResponse.json(errorResponse("Elegí el camión."), { status: 400 });
    }
    // Un vendedor móvil sale con su camión, no manda a otro: el reparto se abre
    // siempre a su nombre, venga lo que venga en el body.
    const yo = await usuarioDelSchema({ schema, empresaId, email: ctx.auth.user.email, catalogId: ctx.auth.usuarioCatalogId ?? null });
    const propio = alcanceRepartos(yo?.rol) === "propios";
    const repartidorId = propio && yo ? yo.id : String(body?.repartidor_id ?? "").trim();
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

    // Un repartidor tampoco puede tener dos repartos abiertos, aunque sean de
    // camiones distintos: sale con uno solo, y con dos abiertos la caja no
    // puede resolver de cuál vende —le queda pidiendo que elija en cada venta—
    // y el control de mercadería se reparte entre dos jornadas que en la calle
    // fueron una. Pasó con dos camiones duplicados asignados a la misma
    // persona.
    const suyoQ = await client.query<{ id: string; camion: string | null }>(
      `SELECT r.id, c.alias AS camion
         FROM ${tR} r LEFT JOIN ${tC} c ON c.id = r.camion_id
        WHERE r.empresa_id = $1::uuid AND r.repartidor_id = $2::uuid AND r.estado = 'abierto'
        FOR UPDATE OF r`,
      [empresaId, repartidorId]
    );
    if (suyoQ.rows.length > 0) {
      await client.query("ROLLBACK");
      const otro = suyoQ.rows[0].camion?.trim();
      return NextResponse.json(
        errorResponse(
          otro
            ? `Ese repartidor ya tiene abierto el reparto de ${otro}. Cerralo antes de abrir otro.`
            : "Ese repartidor ya tiene un reparto abierto. Cerralo antes de abrir otro."
        ),
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

    // La caja del reparto se abre sola. El camión sale sin plata en el cajón y
    // la junta en la calle, así que el monto de apertura es 0 de verdad: no es
    // un valor de relleno. Y el repartidor no tiene por qué entrar a otra
    // pantalla para poder cobrar.
    let cajaAbierta = false;
    if (await tablaExiste(client, schema, "cajas")) {
      const tCajas = quoteSchemaTable(schema, "cajas");
      const yaHay = await client.query<{ id: string }>(
        `SELECT id FROM ${tCajas} WHERE empresa_id = $1::uuid AND estado = 'abierta' FOR UPDATE`,
        [empresaId]
      );
      if (yaHay.rows.length === 0) {
        const sig = await client.query<{ n: string }>(
          `SELECT COALESCE(max(numero_caja), 0)::text AS n FROM ${tCajas} WHERE empresa_id = $1::uuid`,
          [empresaId]
        );
        await client.query(
          `INSERT INTO ${tCajas} (empresa_id, numero_caja, estado, monto_apertura, fecha_apertura)
           VALUES ($1::uuid, $2, 'abierta', 0, now())`,
          [empresaId, Number(sig.rows[0].n) + 1]
        );
        cajaAbierta = true;
      }
    }

    await client.query("COMMIT");
    return NextResponse.json(
      successResponse({
        reparto_id: repartoId,
        productos: Number(foto.rows[0]?.n ?? 0),
        caja_abierta: cajaAbierta,
      })
    );
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[/api/repartos POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo abrir el reparto."), { status: 500 });
  } finally {
    client?.release();
  }
}
