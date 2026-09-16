import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { esRolAdminEmpresa } from "@/lib/modulos/resolve-effective-modules";
import { usuarioDelSchema } from "@/lib/repartos/server/repartos-pg";
import { isErpRolVendedorMovil } from "@/lib/usuarios/erp-rol-normalize";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/ventas/[id]/anular — deja sin efecto una venta.
 *
 * Anular no es borrar: la venta queda con `estado = 'anulada'` y su número no
 * se reutiliza. Lo que sí se deshace es todo lo que la venta movió:
 *
 *  - el stock vuelve, al general y al camión del que salió;
 *  - se registra un movimiento de ENTRADA, para que el inventario tenga el
 *    porqué del cambio y no aparezca mercadería de la nada;
 *  - se descuenta de lo vendido del reparto, que es contra lo que se cuenta al
 *    cerrar el camión;
 *  - el cobro se marca anulado, así el arqueo no lo sigue esperando en el cajón.
 *
 * Todo en una transacción: una anulación a medias sería peor que no anular.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

  let client;
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const { id } = await context.params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json(errorResponse("Venta inválida."), { status: 400 });
    }

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const motivo = String(
      ((await request.json().catch(() => ({}))) as Record<string, unknown>).motivo ?? ""
    )
      .trim()
      .slice(0, 300);

    const tV = quoteSchemaTable(schema, "ventas");
    const tVI = quoteSchemaTable(schema, "ventas_items");
    const tP = quoteSchemaTable(schema, "productos");

    client = await pool.connect();
    await client.query("BEGIN");

    const ventaQ = await client.query<{
      numero_control: string;
      estado: string | null;
      reparto_id: string | null;
      fecha_dia: string;
      hoy: string;
    }>(
      `SELECT v.numero_control, v.estado,
              ${await tieneColumna(client, schema, "ventas", "reparto_id") ? "v.reparto_id" : "NULL::uuid AS reparto_id"},
              (v.fecha AT TIME ZONE 'America/Asuncion')::date::text AS fecha_dia,
              (now() AT TIME ZONE 'America/Asuncion')::date::text   AS hoy
         FROM ${tV} v
        WHERE v.id = $1::uuid AND v.empresa_id = $2::uuid
        FOR UPDATE`,
      [id, empresaId]
    );
    const venta = ventaQ.rows[0];
    if (!venta) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Esa venta no existe."), { status: 404 });
    }
    if ((venta.estado ?? "") === "anulada") {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Esa venta ya está anulada."), { status: 409 });
    }

    // Quién puede anular: el administrador, siempre. El vendedor móvil, solo lo
    // suyo y en el día: corregir el error de tipeo recién hecho es parte de
    // vender, pero tocar la jornada de ayer ya es cuestión del que controla.
    const yo = await usuarioDelSchema({ schema, empresaId, email: ctx.auth.user?.email });
    const esAdmin = esRolAdminEmpresa(ctx.auth.rol) || !isErpRolVendedorMovil(yo?.rol);
    if (!esAdmin) {
      if (venta.fecha_dia !== venta.hoy) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          errorResponse("Solo se puede anular una venta del día. Pedíselo a un supervisor."),
          { status: 403 }
        );
      }
      const mia = venta.reparto_id
        ? await client.query(
            `SELECT 1 FROM ${quoteSchemaTable(schema, "repartos")}
              WHERE id = $1::uuid AND empresa_id = $2::uuid AND repartidor_id = $3::uuid`,
            [venta.reparto_id, empresaId, yo?.id ?? null]
          )
        : { rows: [] };
      if (mia.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(errorResponse("Esa venta no es tuya."), { status: 403 });
      }
    }

    const itemsQ = await client.query<{
      producto_id: string;
      producto_nombre: string;
      sku: string;
      cantidad: string;
    }>(
      `SELECT producto_id, producto_nombre, sku, cantidad::text AS cantidad
         FROM ${tVI} WHERE venta_id = $1::uuid`,
      [id]
    );

    // La ubicación del camión: la mercadería tiene que volver de donde salió.
    let ubicacionId: string | null = null;
    if (venta.reparto_id) {
      const ubiQ = await client.query<{ ubicacion_id: string | null }>(
        `SELECT c.ubicacion_id
           FROM ${quoteSchemaTable(schema, "repartos")} r
           JOIN ${quoteSchemaTable(schema, "camiones")} c ON c.id = r.camion_id
          WHERE r.id = $1::uuid AND r.empresa_id = $2::uuid`,
        [venta.reparto_id, empresaId]
      );
      ubicacionId = ubiQ.rows[0]?.ubicacion_id ?? null;
    }

    const hayStockUbi = await tablaExiste(client, schema, "inventario_stock_ubicacion");
    const hayMovs = await tablaExiste(client, schema, "movimientos_inventario");
    const movTieneUbicacion =
      hayMovs && (await tieneColumna(client, schema, "movimientos_inventario", "ubicacion_id"));
    const hayRepartoStock = await tablaExiste(client, schema, "reparto_stock");

    for (const it of itemsQ.rows) {
      const cantidad = Number(it.cantidad);
      if (!(cantidad > 0)) continue;

      await client.query(
        `UPDATE ${tP} SET stock_actual = COALESCE(stock_actual, 0) + $1::numeric
          WHERE id = $2::uuid AND empresa_id = $3::uuid`,
        [cantidad, it.producto_id, empresaId]
      );

      if (ubicacionId !== null && hayStockUbi) {
        await client.query(
          `INSERT INTO ${quoteSchemaTable(schema, "inventario_stock_ubicacion")}
             (empresa_id, producto_id, ubicacion_id, stock_actual)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::numeric)
           ON CONFLICT (empresa_id, producto_id, ubicacion_id)
           DO UPDATE SET stock_actual = ${quoteSchemaTable(schema, "inventario_stock_ubicacion")}.stock_actual + EXCLUDED.stock_actual,
                         updated_at = now()`,
          [empresaId, it.producto_id, ubicacionId, cantidad]
        );
      }

      if (hayMovs) {
        await client.query(
          `INSERT INTO ${quoteSchemaTable(schema, "movimientos_inventario")} (
             empresa_id, producto_id, producto_nombre, producto_sku,
             tipo, cantidad, origen, referencia, fecha, venta_id
             ${movTieneUbicacion ? ", ubicacion_id" : ""}
           ) VALUES (
             $1::uuid, $2::uuid, $3, $4,
             'ENTRADA', $5::numeric, 'anulacion', $6, now(), $7::uuid
             ${movTieneUbicacion ? ", $8::uuid" : ""}
           )`,
          [
            empresaId,
            it.producto_id,
            it.producto_nombre,
            it.sku,
            cantidad,
            `Anulación ${venta.numero_control}`,
            id,
            ...(movTieneUbicacion ? [ubicacionId] : []),
          ]
        );
      }

      if (venta.reparto_id && hayRepartoStock) {
        await client.query(
          `UPDATE ${quoteSchemaTable(schema, "reparto_stock")}
              SET cantidad_vendida = GREATEST(COALESCE(cantidad_vendida, 0) - $1::numeric, 0),
                  updated_at = now()
            WHERE reparto_id = $2::uuid AND producto_id = $3::uuid`,
          [cantidad, venta.reparto_id, it.producto_id]
        );
      }
    }

    // El cobro deja de contar en el arqueo, pero la fila queda: borrarla dejaría
    // el movimiento de caja sin rastro de que existió.
    if (await tablaExiste(client, schema, "caja_movimientos")) {
      await client.query(
        `UPDATE ${quoteSchemaTable(schema, "caja_movimientos")}
            SET anulado_at = now()
          WHERE venta_id = $1::uuid AND empresa_id = $2::uuid AND anulado_at IS NULL`,
        [id, empresaId]
      );
    }

    const tieneObs = await tieneColumna(client, schema, "ventas", "observaciones");
    await client.query(
      `UPDATE ${tV}
          SET estado = 'anulada'
              ${tieneObs && motivo ? ", observaciones = COALESCE(observaciones || ' | ', '') || $3" : ""}
        WHERE id = $1::uuid AND empresa_id = $2::uuid`,
      tieneObs && motivo
        ? [id, empresaId, `ANULADA: ${motivo}`]
        : [id, empresaId]
    );

    await client.query("COMMIT");
    return NextResponse.json(
      successResponse({ venta_id: id, numero_control: venta.numero_control, estado: "anulada" })
    );
  } catch (err) {
    await client?.query("ROLLBACK").catch(() => undefined);
    console.error("[/api/ventas/[id]/anular]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo anular la venta."), { status: 500 });
  } finally {
    client?.release();
  }
}

type Cliente = { query: (q: string, p?: unknown[]) => Promise<{ rows: unknown[] }> };

async function tablaExiste(client: Cliente, schema: string, tabla: string): Promise<boolean> {
  const q = (await client.query(`SELECT to_regclass($1)::text AS t`, [`${schema}.${tabla}`])) as {
    rows: { t: string | null }[];
  };
  return q.rows[0]?.t != null;
}

async function tieneColumna(
  client: Cliente,
  schema: string,
  tabla: string,
  columna: string
): Promise<boolean> {
  const q = (await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
    [schema, tabla, columna]
  )) as { rows: unknown[] };
  return q.rows.length > 0;
}
