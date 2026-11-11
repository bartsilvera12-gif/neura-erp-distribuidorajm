import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { asegurarCajaAbierta } from "@/lib/cajas/server/asegurar-caja";
import { emitirReciboCobro, numeroRecibo } from "@/lib/cobranzas/server/recibos-pg";
import { sincronizarFacturaDeVenta } from "@/lib/cobranzas/server/sincronizar-factura";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MEDIOS = new Set(["efectivo", "tarjeta", "transferencia", "cheque", "otro"]);
/** Pago mixto: un item por medio con los datos propios del medio. */
type PagoCobro = {
  medio: string;
  monto: number;
  banco?: string | null;
  numero_cheque?: string | null;
  fecha_emision?: string | null;
  fecha_cobro?: string | null;
};

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

    if (!UUID_RE.test(ventaId)) {
      return NextResponse.json(errorResponse("Venta inválida."), { status: 400 });
    }

    // Puede venir "pagos": [{medio, monto, banco?, numero_cheque?, ...}] para mixto,
    // o los campos sueltos (compatibilidad con la UI anterior).
    const pagos: PagoCobro[] = Array.isArray(body.pagos) && body.pagos.length > 0
      ? (body.pagos as Record<string, unknown>[]).map((p) => ({
          medio: String(p.medio ?? "efectivo").trim().toLowerCase(),
          monto: Number(p.monto),
          banco: p.banco ? String(p.banco).trim() : null,
          numero_cheque: p.numero_cheque ? String(p.numero_cheque).trim() : null,
          fecha_emision: p.fecha_emision && FECHA_RE.test(String(p.fecha_emision))
            ? String(p.fecha_emision) : null,
          fecha_cobro: p.fecha_cobro && FECHA_RE.test(String(p.fecha_cobro))
            ? String(p.fecha_cobro) : null,
        }))
      : [{
          medio: String(body.medio_pago ?? "efectivo").trim().toLowerCase(),
          monto: Number(body.monto),
          banco: body.banco ? String(body.banco).trim() : null,
          numero_cheque: body.numero_cheque ? String(body.numero_cheque).trim() : null,
          fecha_emision: body.fecha_emision && FECHA_RE.test(String(body.fecha_emision))
            ? String(body.fecha_emision) : null,
          fecha_cobro: body.fecha_cobro && FECHA_RE.test(String(body.fecha_cobro))
            ? String(body.fecha_cobro) : null,
        }];

    // Validaciones por pago: medio válido + monto > 0 + datos obligatorios por medio.
    for (const p of pagos) {
      if (!MEDIOS.has(p.medio)) {
        return NextResponse.json(errorResponse(`Medio de pago inválido: ${p.medio}.`), { status: 400 });
      }
      if (!Number.isFinite(p.monto) || p.monto <= 0) {
        return NextResponse.json(errorResponse("Cada parte del pago tiene que ser mayor a cero."), { status: 400 });
      }
      if (p.medio === "cheque" && !p.numero_cheque) {
        return NextResponse.json(errorResponse("Cheque: falta el número."), { status: 400 });
      }
    }

    const monto = pagos.reduce((s, p) => s + p.monto, 0);
    // Para el concepto/log: el medio de pago "representativo". Si es mixto, lo
    // decimos así; si es un solo medio, ese.
    const medio = pagos.length === 1 ? pagos[0].medio : "mixto";

    const tV = quoteSchemaTable(schema, "ventas");
    const tM = quoteSchemaTable(schema, "caja_movimientos");

    // La caja se asegura ANTES de tomar la conexión de la venta: tiene su
    // propia transacción, y pedir una segunda conexión con la primera tomada
    // traba el pool cuando hay varios cobros a la vez.
    const cajaId = await asegurarCajaAbierta(schema, empresaId, ctx.auth.usuarioCatalogId ?? null);
    if (!cajaId) {
      return NextResponse.json(errorResponse("No hay caja donde registrar el cobro."), { status: 409 });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    // Con la venta bloqueada, dos cobros simultáneos del mismo cliente no pueden
    // pasarse del saldo entre los dos.
    const ventaQ = await client.query<{
      numero_control: string;
      cliente_id: string | null;
      total: string;
      tipo_venta: string | null;
      estado: string | null;
      cobrado: string;
    }>(
      `SELECT v.numero_control, v.cliente_id, v.total::text AS total, v.tipo_venta, v.estado,
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

    // Columnas opcionales (SQL 65): se detectan en runtime. Sin la migración
    // los datos del cheque/banco van a `observacion` como texto.
    const colsQ = await client.query<{ c: string }>(
      `SELECT column_name AS c FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'caja_movimientos'
          AND column_name IN ('banco_origen','numero_cheque','fecha_emision_cheque','fecha_cobro_cheque','observacion')`,
      [schema]
    );
    const tieneCol = new Set(colsQ.rows.map((r) => r.c));

    // Un INSERT por cada parte del pago. En mixto son N filas; la suma de
    // sus montos es el total cobrado, y todas apuntan a la misma venta.
    const movs: { id: string; created_at: string }[] = [];
    for (const p of pagos) {
      const extras: string[] = [];
      const vals: unknown[] = [empresaId, cajaId, `Cobro ${venta.numero_control}`, p.monto, p.medio, ventaId];
      // observacion: texto legible con los datos propios del medio (siempre, por si
      // falta alguna columna).
      const obs: string[] = [];
      if (p.banco) obs.push(`Banco: ${p.banco}`);
      if (p.numero_cheque) obs.push(`Cheque N° ${p.numero_cheque}`);
      if (p.fecha_emision) obs.push(`Emitido ${p.fecha_emision}`);
      if (p.fecha_cobro) obs.push(`A cobrar ${p.fecha_cobro}`);
      if (tieneCol.has("observacion") && obs.length > 0) {
        vals.push(obs.join(" · "));
        extras.push(`observacion = $${vals.length}`);
      }
      if (tieneCol.has("banco_origen") && p.banco) {
        vals.push(p.banco);
        extras.push(`banco_origen = $${vals.length}`);
      }
      if (tieneCol.has("numero_cheque") && p.numero_cheque) {
        vals.push(p.numero_cheque);
        extras.push(`numero_cheque = $${vals.length}`);
      }
      if (tieneCol.has("fecha_emision_cheque") && p.fecha_emision) {
        vals.push(p.fecha_emision);
        extras.push(`fecha_emision_cheque = $${vals.length}::date`);
      }
      if (tieneCol.has("fecha_cobro_cheque") && p.fecha_cobro) {
        vals.push(p.fecha_cobro);
        extras.push(`fecha_cobro_cheque = $${vals.length}::date`);
      }
      const sql = `INSERT INTO ${tM} (empresa_id, caja_id, tipo, concepto, monto, medio_pago, venta_id${
        extras.length > 0 ? ", " + extras.map((e) => e.split(" = ")[0]).join(", ") : ""
      })
         VALUES ($1::uuid, $2::uuid, 'ingreso', $3, $4::numeric, $5, $6::uuid${
        extras.length > 0 ? ", " + extras.map((e) => e.split(" = ")[1]).join(", ") : ""
      })
         RETURNING id, created_at`;
      const ins = await client.query<{ id: string; created_at: string }>(sql, vals);
      if (ins.rows[0]) movs.push(ins.rows[0]);
    }
    const mov = movs[0] ?? null;
    await client.query("COMMIT");
    // Se suelta ya: el recibo usa el pool por su cuenta.
    client.release();
    client = null;

    // Recibo de dinero numerado (SQL 53). Si falla, el cobro ya está hecho:
    // no se lo hace fallar por el recibo, sale con la referencia del movimiento.
    // La factura de la venta baja su saldo (y queda "Pagado" si se cobró todo).
    await sincronizarFacturaDeVenta(pool, schema, empresaId, ventaId);

    const recibo = await emitirReciboCobro(pool, schema, empresaId, {
      ventaId,
      ventaNumero: venta.numero_control,
      clienteId: venta.cliente_id,
      monto,
      medioPago: medio,
      saldoRestante: saldo - monto,
      cajaMovimientoId: mov?.id ?? null,
      fecha: mov?.created_at ?? null,
      usuario: ctx.auth.user?.email ?? null,
    }).catch((e) => {
      console.error("[/api/cobranzas/credito/cobrar] recibo:", e instanceof Error ? e.message : e);
      return null;
    });

    return NextResponse.json(
      successResponse({
        venta_id: ventaId,
        cobrado: monto,
        saldo: saldo - monto,
        // Datos del recibo de dinero: el cobro ya quedó registrado como
        // movimiento de caja; su id es la referencia del recibo.
        recibo_id: mov?.id ?? null,
        recibo_numero: recibo ? numeroRecibo(recibo.numero) : null,
        cliente_ruc: recibo?.cliente_ruc ?? null,
        fecha: mov?.created_at ?? new Date().toISOString(),
      })
    );
  } catch (err) {
    await client?.query("ROLLBACK").catch(() => undefined);
    console.error("[/api/cobranzas/credito/cobrar]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo registrar el cobro."), { status: 500 });
  } finally {
    client?.release();
  }
}
