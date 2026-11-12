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
const TOL = 2; // guaraníes — tolerancia de redondeo
const MEDIOS = ["efectivo", "transferencia", "cheque", "tarjeta"] as const;
type Medio = (typeof MEDIOS)[number];

const gs = (n: number) => `Gs. ${Math.round(n).toLocaleString("es-PY")}`;

/**
 * POST /api/ventas/[id]/pagos — corrige cómo se cobró una venta ya registrada
 * (medios e importes), sin anularla.
 *
 * El total cobrado no cambia: los nuevos importes tienen que sumar lo mismo que
 * entró a caja. Los movimientos de caja viejos NO se borran: quedan marcados
 * como anulados con el motivo y quién los corrigió, y se crean los nuevos en la
 * misma caja y con la misma fecha/hora del cobro original, así el arqueo del
 * día se corrige solo y queda el rastro para el control.
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

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const motivo = String(body.motivo ?? "").trim().slice(0, 300);
    if (!motivo) {
      return NextResponse.json(errorResponse("Escribí el motivo de la corrección."), { status: 400 });
    }

    // Se juntan los importes por medio (dos filas del mismo medio se suman).
    const porMedio = new Map<Medio, number>();
    const crudo = Array.isArray(body.pagos) ? (body.pagos as unknown[]) : [];
    for (const p of crudo) {
      const o = (p ?? {}) as Record<string, unknown>;
      const medio = String(o.medio ?? "").toLowerCase() as Medio;
      const monto = Math.round(Number(o.monto));
      if (!MEDIOS.includes(medio) || !Number.isFinite(monto) || monto < 0) {
        return NextResponse.json(errorResponse("Hay un medio o un importe inválido."), { status: 400 });
      }
      if (monto === 0) continue;
      porMedio.set(medio, (porMedio.get(medio) ?? 0) + monto);
    }
    const nuevos = [...porMedio.entries()].map(([medio, monto]) => ({ medio, monto }));
    if (nuevos.length === 0) {
      return NextResponse.json(errorResponse("Cargá al menos un importe."), { status: 400 });
    }
    if (nuevos.length > 1 && nuevos.some((n) => n.medio === "tarjeta")) {
      return NextResponse.json(
        errorResponse("Tarjeta no se puede combinar en un pago mixto."),
        { status: 400 }
      );
    }

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const yo = await usuarioDelSchema({
      schema,
      empresaId,
      email: ctx.auth.user?.email,
      catalogId: ctx.auth.usuarioCatalogId ?? null,
    });

    // Corregir lo cobrado es cuestión de quien controla la caja, no del vendedor móvil.
    const esAdmin = esRolAdminEmpresa(ctx.auth.rol) || !isErpRolVendedorMovil(yo?.rol);
    if (!esAdmin) {
      return NextResponse.json(
        errorResponse("Solo un supervisor puede corregir los pagos de una venta."),
        { status: 403 }
      );
    }

    const tV = quoteSchemaTable(schema, "ventas");
    const tM = quoteSchemaTable(schema, "caja_movimientos");

    client = await pool.connect();
    await client.query("BEGIN");

    const ventaQ = await client.query<{
      numero_control: string;
      estado: string | null;
      tipo_venta: string;
      metodo_pago: string | null;
    }>(
      `SELECT numero_control, estado, tipo_venta, metodo_pago
         FROM ${tV}
        WHERE id = $1::uuid AND empresa_id = $2::uuid
        FOR UPDATE`,
      [id, empresaId]
    );
    const venta = ventaQ.rows[0];
    if (!venta) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Esa venta no existe."), { status: 404 });
    }
    if ((venta.estado ?? "").toLowerCase() === "anulada") {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("La venta está anulada."), { status: 409 });
    }
    if (venta.tipo_venta !== "CONTADO") {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Solo se corrigen pagos de ventas de contado."), { status: 409 });
    }

    const movQ = await client.query<{
      id: string;
      caja_id: string;
      medio_pago: string;
      monto: string;
      created_at: string;
    }>(
      `SELECT id, caja_id, medio_pago, monto::text AS monto, created_at::text AS created_at
         FROM ${tM}
        WHERE venta_id = $1::uuid AND empresa_id = $2::uuid
          AND tipo = 'ingreso' AND anulado_at IS NULL
        ORDER BY created_at, id
        FOR UPDATE`,
      [id, empresaId]
    );
    if (movQ.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(errorResponse("Esta venta no tiene cobro registrado en caja."), { status: 409 });
    }

    const totalCaja = movQ.rows.reduce((s, m) => s + Number(m.monto), 0);
    const totalNuevo = nuevos.reduce((s, n) => s + n.monto, 0);
    if (Math.abs(totalNuevo - totalCaja) > TOL) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse(`Los importes suman ${gs(totalNuevo)} y lo cobrado en caja es ${gs(totalCaja)}. Tienen que coincidir.`),
        { status: 400 }
      );
    }

    const quien = ctx.auth.user?.email ?? "usuario";
    const antes = movQ.rows.map((m) => `${m.medio_pago} ${gs(Number(m.monto))}`).join(" + ");
    const despues = nuevos.map((n) => `${n.medio} ${gs(n.monto)}`).join(" + ");
    const detalle = `Corrección de pago por ${quien}: ${antes} → ${despues}. Motivo: ${motivo}`.slice(0, 600);

    // Los cobros viejos quedan, anulados y con el motivo: no cuentan en el arqueo.
    await client.query(
      `UPDATE ${tM}
          SET anulado_at = now(), anulado_motivo = $3
        WHERE venta_id = $1::uuid AND empresa_id = $2::uuid
          AND tipo = 'ingreso' AND anulado_at IS NULL`,
      [id, empresaId, detalle]
    );

    // Los nuevos van a la misma caja y con la hora del cobro original.
    const base = movQ.rows[0];
    const mixto = nuevos.length > 1;
    for (const n of nuevos) {
      await client.query(
        `INSERT INTO ${tM}
           (empresa_id, caja_id, tipo, concepto, monto, medio_pago, venta_id, usuario_id, usuario_email, observacion, created_at)
         VALUES ($1::uuid, $2::uuid, 'ingreso', $3, $4, $5, $6::uuid, $7::uuid, $8, $9, $10::timestamptz)`,
        [
          empresaId,
          base.caja_id,
          `Venta ${venta.numero_control}${mixto ? " (mixto)" : ""} · pago corregido`,
          n.monto,
          n.medio,
          id,
          yo?.id ?? null,
          ctx.auth.user?.email ?? null,
          detalle,
          base.created_at,
        ]
      );
    }

    const metodo = mixto ? "mixto" : nuevos[0].medio;
    await client.query(
      `UPDATE ${tV}
          SET metodo_pago = $3,
              observaciones = COALESCE(observaciones || ' | ', '') || $4
        WHERE id = $1::uuid AND empresa_id = $2::uuid`,
      [id, empresaId, metodo, `PAGO CORREGIDO: ${antes} → ${despues} (${quien}). ${motivo}`.slice(0, 600)]
    );

    await client.query("COMMIT");
    return NextResponse.json(
      successResponse({ venta_id: id, numero_control: venta.numero_control, metodo_pago: metodo, pagos: nuevos })
    );
  } catch (err) {
    await client?.query("ROLLBACK").catch(() => undefined);
    console.error("[/api/ventas/[id]/pagos]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo corregir el pago."), { status: 500 });
  } finally {
    client?.release();
  }
}
