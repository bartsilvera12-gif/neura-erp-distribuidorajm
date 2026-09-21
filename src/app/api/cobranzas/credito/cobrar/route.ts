import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { asegurarCajaAbierta } from "@/lib/cajas/server/asegurar-caja";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEDIOS = new Set(["efectivo", "tarjeta", "transferencia", "cheque", "otro"]);

/**
 * POST /api/cobranzas/credito/cobrar — registra el cobro de una venta a crédito.
 * Body: { venta_id, monto, medio_pago }
 *
 * El cobro es un ingreso de caja imputado a esa venta. De ahí sale el saldo
 * (total − cobrado) y de ahí lo toma el arqueo: la plata que el vendedor cobra
 * en la ruta entra al cajón por el mismo camino que una venta de contado, sin
 * cargarla dos veces.
 *
 * Acepta cobros parciales —el cliente paga lo que tiene— pero nunca más que el
 * saldo: un cobro de más no es un cobro, es un error de tipeo que después hay
 * que ir a buscar.
 */
export async function POST(request: NextRequest) {
  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

  let client;
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const ventaId = String(body.venta_id ?? "").trim();
    const monto = Number(body.monto);
    const medio = String(body.medio_pago ?? "efectivo").trim().toLowerCase();

    if (!UUID_RE.test(ventaId)) {
      return NextResponse.json(errorResponse("Venta inválida."), { status: 400 });
    }
    if (!Number.isFinite(monto) || monto <= 0) {
      return NextResponse.json(errorResponse("El monto tiene que ser mayor a cero."), { status: 400 });
    }
    if (!MEDIOS.has(medio)) {
      return NextResponse.json(errorResponse("Medio de pago inválido."), { status: 400 });
    }

    const tV = quoteSchemaTable(schema, "ventas");
    const tM = quoteSchemaTable(schema, "caja_movimientos");

    client = await pool.connect();
    await client.query("BEGIN");

    // Con la venta bloqueada, dos cobros simultáneos del mismo cliente no pueden
    // pasarse del saldo entre los dos.
    const ventaQ = await client.query<{
      numero_control: string;
      total: string;
      tipo_venta: string | null;
      estado: string | null;
      cobrado: string;
    }>(
      `SELECT v.numero_control, v.total::text AS total, v.tipo_venta, v.estado,
              COALESCE((SELECT sum(m.monto) FROM ${tM} m
                         WHERE m.venta_id = v.id AND m.tipo = 'ingreso'
                           AND m.anulado_at IS NULL), 0)::text AS cobrado
         FROM ${tV} v
        WHERE v.id = $1::uuid AND v.empresa_id = $2::uuid
        FOR UPDATE OF v`,
      [ventaId, empresaId]
    );
    const venta = ventaQ.rows[0];
    if (!venta) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Esa venta no existe."), { status: 404 });
    }
    if (venta.tipo_venta !== "CREDITO") {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Esa venta no es a crédito."), { status: 400 });
    }
    if ((venta.estado ?? "") === "anulada") {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Esa venta está anulada."), { status: 400 });
    }

    const saldo = Number(venta.total) - Number(venta.cobrado);
    // Medio guaraní de tolerancia: el redondeo no tiene que trabar un cobro que
    // en la práctica cancela la deuda.
    if (monto > saldo + 0.5) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse(`Esa venta debe Gs. ${Math.round(saldo).toLocaleString("es-PY")}.`),
        { status: 400 }
      );
    }

    await client.query("COMMIT");

    // La caja se abre fuera de esta transacción porque tiene la suya: si no
    // hubiera ninguna abierta, el cobro la abre igual que lo hace una venta.
    const cajaId = await asegurarCajaAbierta(schema, empresaId, ctx.auth.usuarioCatalogId ?? null);
    if (!cajaId) {
      return NextResponse.json(errorResponse("No hay caja donde registrar el cobro."), { status: 409 });
    }

    await pool.query(
      `INSERT INTO ${tM} (empresa_id, caja_id, tipo, concepto, monto, medio_pago, venta_id)
       VALUES ($1::uuid, $2::uuid, 'ingreso', $3, $4::numeric, $5, $6::uuid)`,
      [empresaId, cajaId, `Cobro ${venta.numero_control}`, monto, medio, ventaId]
    );

    return NextResponse.json(
      successResponse({ venta_id: ventaId, cobrado: monto, saldo: saldo - monto })
    );
  } catch (err) {
    await client?.query("ROLLBACK").catch(() => undefined);
    console.error("[/api/cobranzas/credito/cobrar]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo registrar el cobro."), { status: 500 });
  } finally {
    client?.release();
  }
}
