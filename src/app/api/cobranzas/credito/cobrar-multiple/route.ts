import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { asegurarCajaAbierta } from "@/lib/cajas/server/asegurar-caja";
import { emitirReciboMulticobro, numeroRecibo } from "@/lib/cobranzas/server/recibos-pg";
import { sincronizarFacturaDeVenta } from "@/lib/cobranzas/server/sincronizar-factura";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MEDIOS = new Set(["efectivo", "transferencia", "cheque"]);

/**
 * POST /api/cobranzas/credito/cobrar-multiple — cobra varias ventas a crédito
 * del MISMO cliente en una sola operación, con UN solo recibo.
 * Body: { items: [{ venta_id, monto }], medio_pago, banco?, numero_cheque?, fecha_emision?, fecha_cobro? }
 *
 * Cada venta recibe su ingreso de caja (igual que un cobro individual), así
 * caja, arqueo y reportes siguen leyendo lo mismo. No se toca la venta original.
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
    const medio = String(body.medio_pago ?? "efectivo").trim().toLowerCase();
    if (!MEDIOS.has(medio)) {
      return NextResponse.json(errorResponse(`Medio de pago inválido: ${medio}.`), { status: 400 });
    }
    const banco = body.banco ? String(body.banco).trim() : null;
    const numeroCheque = body.numero_cheque ? String(body.numero_cheque).trim() : null;
    const fEmision = body.fecha_emision && FECHA_RE.test(String(body.fecha_emision)) ? String(body.fecha_emision) : null;
    const fCobro = body.fecha_cobro && FECHA_RE.test(String(body.fecha_cobro)) ? String(body.fecha_cobro) : null;
    if (medio === "cheque" && !numeroCheque) {
      return NextResponse.json(errorResponse("Cheque: falta el número."), { status: 400 });
    }

    const rawItems = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];
    const porVenta = new Map<string, number>();
    for (const it of rawItems) {
      const id = String(it.venta_id ?? "").trim();
      const m = Number(it.monto);
      if (!UUID_RE.test(id)) return NextResponse.json(errorResponse("Venta inválida."), { status: 400 });
      if (!Number.isFinite(m) || m < 0) return NextResponse.json(errorResponse("Monto inválido."), { status: 400 });
      porVenta.set(id, (porVenta.get(id) ?? 0) + m);
    }
    const items = [...porVenta.entries()].filter(([, m]) => m > 0).sort(([a], [b]) => (a < b ? -1 : 1));
    if (items.length === 0) {
      return NextResponse.json(errorResponse("No hay nada para cobrar."), { status: 400 });
    }

    const tV = quoteSchemaTable(schema, "ventas");
    const tM = quoteSchemaTable(schema, "caja_movimientos");

    const cajaId = await asegurarCajaAbierta(schema, empresaId, ctx.auth.usuarioCatalogId ?? null);
    if (!cajaId) return NextResponse.json(errorResponse("No hay caja donde registrar el cobro."), { status: 409 });

    client = await pool.connect();
    await client.query("BEGIN");

    const ventasQ = await client.query<{
      id: string;
      numero_control: string;
      cliente_id: string | null;
      total: string;
      tipo_venta: string | null;
      estado: string | null;
      cobrado: string;
    }>(
      `SELECT v.id::text AS id, v.numero_control, v.cliente_id::text AS cliente_id, v.total::text AS total, v.tipo_venta, v.estado,
              COALESCE((SELECT sum(m.monto) FROM ${tM} m
                         WHERE m.venta_id = v.id AND m.tipo = 'ingreso' AND m.anulado_at IS NULL), 0)::text AS cobrado
         FROM ${tV} v
        WHERE v.id = ANY($1::uuid[]) AND v.empresa_id = $2::uuid
        ORDER BY v.id
        FOR UPDATE OF v`,
      [items.map(([id]) => id), empresaId]
    );
    if (ventasQ.rows.length !== items.length) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Alguna de las ventas no existe."), { status: 404 });
    }
    const clientes = new Set(ventasQ.rows.map((v) => v.cliente_id ?? ""));
    if (clientes.size !== 1 || clientes.has("")) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Todas las facturas tienen que ser del mismo cliente."), { status: 400 });
    }
    const clienteId = ventasQ.rows[0].cliente_id;

    for (const v of ventasQ.rows) {
      if (v.tipo_venta !== "CREDITO" || (v.estado ?? "") === "anulada") {
        await client.query("ROLLBACK");
        return NextResponse.json(errorResponse(`${v.numero_control} no es una venta a crédito cobrable.`), { status: 400 });
      }
      const saldo = Number(v.total) - Number(v.cobrado);
      const monto = porVenta.get(v.id) ?? 0;
      if (monto > saldo + 0.5) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          errorResponse(`${v.numero_control} debe Gs. ${Math.round(saldo).toLocaleString("es-PY")}.`),
          { status: 400 }
        );
      }
    }

    const colsQ = await client.query<{ c: string }>(
      `SELECT column_name AS c FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'caja_movimientos'
          AND column_name IN ('banco_origen','numero_cheque','fecha_emision_cheque','fecha_cobro_cheque','observacion')`,
      [schema]
    );
    const tieneCol = new Set(colsQ.rows.map((r) => r.c));
    const obs: string[] = [];
    if (banco) obs.push(`Banco: ${banco}`);
    if (numeroCheque) obs.push(`Cheque N° ${numeroCheque}`);
    if (fEmision) obs.push(`Emitido ${fEmision}`);
    if (fCobro) obs.push(`A cobrar ${fCobro}`);

    const detalle: { ventaId: string; numero: string; monto: number; saldoRestante: number; movIds: string[] }[] = [];
    let primerMov: { id: string; created_at: string } | null = null;
    for (const v of ventasQ.rows) {
      const monto = porVenta.get(v.id) ?? 0;
      const cols = ["empresa_id", "caja_id", "tipo", "concepto", "monto", "medio_pago", "venta_id"];
      const vals: unknown[] = [empresaId, cajaId, "ingreso", `Cobro ${v.numero_control}`, monto, medio, v.id];
      const ph = ["$1::uuid", "$2::uuid", "$3", "$4", "$5::numeric", "$6", "$7::uuid"];
      const add = (col: string, val: unknown, cast = "") => {
        vals.push(val);
        cols.push(col);
        ph.push(`$${vals.length}${cast}`);
      };
      if (tieneCol.has("observacion") && obs.length > 0) add("observacion", obs.join(" · "));
      if (tieneCol.has("banco_origen") && banco) add("banco_origen", banco);
      if (tieneCol.has("numero_cheque") && numeroCheque) add("numero_cheque", numeroCheque);
      if (tieneCol.has("fecha_emision_cheque") && fEmision) add("fecha_emision_cheque", fEmision, "::date");
      if (tieneCol.has("fecha_cobro_cheque") && fCobro) add("fecha_cobro_cheque", fCobro, "::date");
      const ins = await client.query<{ id: string; created_at: string }>(
        `INSERT INTO ${tM} (${cols.join(", ")}) VALUES (${ph.join(", ")}) RETURNING id, created_at`,
        vals
      );
      const mov = ins.rows[0];
      if (mov && !primerMov) primerMov = mov;
      detalle.push({
        ventaId: v.id,
        numero: v.numero_control,
        monto,
        saldoRestante: Math.max(0, Number(v.total) - Number(v.cobrado) - monto),
        movIds: mov ? [mov.id] : [],
      });
    }
    await client.query("COMMIT");
    client.release();
    client = null;

    for (const d of detalle) await sincronizarFacturaDeVenta(pool, schema, empresaId, d.ventaId);

    const total = detalle.reduce((s, d) => s + d.monto, 0);
    const recibo = await emitirReciboMulticobro(pool, schema, empresaId, {
      clienteId,
      monto: total,
      medioPago: medio,
      cajaMovimientoId: (primerMov as { id: string } | null)?.id ?? null,
      fecha: (primerMov as { created_at: string } | null)?.created_at ?? null,
      usuario: ctx.auth.user?.email ?? null,
      detalle,
    }).catch((e) => {
      console.error("[/api/cobranzas/credito/cobrar-multiple] recibo:", e instanceof Error ? e.message : e);
      return null;
    });

    return NextResponse.json(
      successResponse({
        cobrado: total,
        saldo: detalle.reduce((s, d) => s + d.saldoRestante, 0),
        recibo_id: recibo?.id ?? (primerMov as { id: string } | null)?.id ?? null,
        recibo_numero: recibo ? numeroRecibo(recibo.numero) : null,
        cliente_nombre: recibo?.cliente ?? null,
        cliente_ruc: recibo?.cliente_ruc ?? null,
        fecha: (primerMov as { created_at: string } | null)?.created_at ?? new Date().toISOString(),
        detalle: detalle.map((d) => ({ numero: d.numero, monto: d.monto, saldo: d.saldoRestante })),
      })
    );
  } catch (err) {
    await client?.query("ROLLBACK").catch(() => undefined);
    console.error("[/api/cobranzas/credito/cobrar-multiple]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo registrar el cobro."), { status: 500 });
  } finally {
    client?.release();
  }
}
