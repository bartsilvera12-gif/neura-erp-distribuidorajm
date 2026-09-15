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

type Conteo = { producto_id: string; contado: number; motivo: string | null };

function parseConteos(body: unknown): Conteo[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { items?: unknown }).items;
  if (!Array.isArray(raw)) return null;

  const conteos: Conteo[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") return null;
    const o = it as Record<string, unknown>;
    const producto_id = String(o.producto_id ?? "").trim();
    const contado = Number(o.contado);
    if (!UUID_RE.test(producto_id)) return null;
    if (!Number.isFinite(contado) || contado < 0) return null;
    conteos.push({
      producto_id,
      contado,
      motivo: String(o.motivo ?? "").trim() || null,
    });
  }
  return conteos;
}

/**
 * POST /api/repartos/[id]/cerrar — rendición de ruta.
 * Body: { items: [{producto_id, contado, motivo?}], merma_kg?, notas_cierre? }
 *
 * El documento v0.2 (págs. 4 y 7) pide comparar el stock teórico del sistema
 * contra el físico contado por el vendedor, con motivo obligatorio en cada
 * diferencia. El teórico es el saldo de la ubicación del camión, así que ya
 * viene con las cargas y transferencias del día incluidas.
 *
 * Lo contado queda como saldo de la ubicación: no se transfiere al salón, que
 * es la regla de oro del documento — la mercadería sigue físicamente arriba del
 * camión y mañana es su apertura. Cada diferencia deja un AJUSTE en el kardex
 * con su motivo, que es la trazabilidad que pide la página 10.
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
        errorResponse("Este schema no tiene el dominio de repartos (repartos / reparto_stock)."),
        { status: 409 }
      );
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

    const conteos = parseConteos(body);
    if (conteos === null) {
      return NextResponse.json(errorResponse("Conteo inválido: revisá las cantidades."), {
        status: 400,
      });
    }

    const crudo = body?.merma_kg;
    const merma = crudo === undefined || crudo === null || crudo === "" ? 0 : Number(crudo);
    if (!Number.isFinite(merma) || merma < 0) {
      return NextResponse.json(
        errorResponse("La merma tiene que ser un número mayor o igual a 0."),
        { status: 400 }
      );
    }
    const notas = String(body?.notas_cierre ?? "").trim() || null;

    const tR = quoteSchemaTable(schema, "repartos");
    const tC = quoteSchemaTable(schema, "camiones");
    const tS = quoteSchemaTable(schema, "reparto_stock");
    const tP = quoteSchemaTable(schema, "productos");
    const tV = quoteSchemaTable(schema, "ventas");
    const tVI = quoteSchemaTable(schema, "ventas_items");
    const tSU = quoteSchemaTable(schema, "inventario_stock_ubicacion");
    const tM = quoteSchemaTable(schema, "movimientos_inventario");

    client = await pool.connect();
    await client.query("BEGIN");

    // FOR UPDATE: dos cierres simultáneos del mismo reparto se serializan en vez
    // de pisarse el conteo.
    const repartoQ = await client.query<{
      estado: string;
      camion: string;
      ubicacion_id: string | null;
    }>(
      `SELECT r.estado, c.alias AS camion, c.ubicacion_id
         FROM ${tR} r JOIN ${tC} c ON c.id = r.camion_id
        WHERE r.id = $1::uuid AND r.empresa_id = $2::uuid
        FOR UPDATE OF r`,
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
    const ubicacionId = repartoQ.rows[0].ubicacion_id;
    if (!ubicacionId) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse(
          `El camión ${repartoQ.rows[0].camion} no tiene ubicación de inventario. Corré 09_stock_movil.sql.`
        ),
        { status: 409 }
      );
    }

    // Teórico por producto: el saldo actual de la ubicación del camión.
    const teoricosQ = await client.query<{
      producto_id: string;
      nombre: string;
      sku: string;
      teorico: string;
    }>(
      `SELECT rs.producto_id, p.nombre, p.sku,
              COALESCE(su.stock_actual, 0)::text AS teorico
         FROM ${tS} rs
         JOIN ${tP} p ON p.id = rs.producto_id
         LEFT JOIN ${tSU} su
                ON su.producto_id = rs.producto_id AND su.ubicacion_id = $2::uuid
        WHERE rs.reparto_id = $1::uuid`,
      [id, ubicacionId]
    );
    const teoricos = new Map(
      teoricosQ.rows.map((r) => [r.producto_id, { ...r, teorico: Number(r.teorico) }])
    );

    const contados = new Set(conteos.map((c) => c.producto_id));
    const sinContar = [...teoricos.keys()].filter((p) => !contados.has(p));
    if (sinContar.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse(
          `Faltan contar ${sinContar.length} ${sinContar.length === 1 ? "producto" : "productos"}. ` +
            "Si no volvió nada de alguno, poné 0."
        ),
        { status: 400 }
      );
    }

    const ajenos = conteos.filter((c) => !teoricos.has(c.producto_id));
    if (ajenos.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse("Hay productos contados que no estaban en este reparto."),
        { status: 400 }
      );
    }

    // Una diferencia sin motivo es una diferencia que nadie va a poder explicar
    // después. El documento la pide obligatoria (pág. 4).
    const sinMotivo = conteos.filter(
      (c) => c.contado !== teoricos.get(c.producto_id)!.teorico && !c.motivo
    );
    if (sinMotivo.length > 0) {
      const nombres = sinMotivo.map((c) => teoricos.get(c.producto_id)!.nombre).join(", ");
      await client.query("ROLLBACK");
      return NextResponse.json(
        errorResponse(`Poné el motivo de la diferencia en: ${nombres}.`),
        { status: 400 }
      );
    }

    const fechaIso = new Date().toISOString();
    let conDiferencia = 0;

    for (const c of conteos) {
      const t = teoricos.get(c.producto_id)!;
      const delta = c.contado - t.teorico;

      await client.query(
        `UPDATE ${tS}
            SET cantidad_contada = $1, motivo_diferencia = $2, updated_at = now()
          WHERE reparto_id = $3::uuid AND producto_id = $4::uuid`,
        [c.contado, c.motivo, id, c.producto_id]
      );

      if (delta === 0) continue;
      conDiferencia += 1;

      // El saldo de la ubicación pasa a ser lo contado: manda el físico.
      await client.query(
        `INSERT INTO ${tSU} (empresa_id, producto_id, ubicacion_id, stock_actual)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
         ON CONFLICT (empresa_id, producto_id, ubicacion_id)
         DO UPDATE SET stock_actual = EXCLUDED.stock_actual, updated_at = now()`,
        [empresaId, c.producto_id, ubicacionId, c.contado]
      );

      // El total global se mueve por el mismo delta: si en el camión sobraban
      // 2 kg, sobran 2 kg en la empresa.
      await client.query(
        `UPDATE ${tP} SET stock_actual = stock_actual + $1, updated_at = now()
          WHERE id = $2::uuid AND empresa_id = $3::uuid`,
        [delta, c.producto_id, empresaId]
      );

      await client.query(
        `INSERT INTO ${tM} (
           empresa_id, producto_id, producto_nombre, producto_sku,
           tipo, cantidad, origen, referencia, fecha, ubicacion_id
         ) VALUES ($1::uuid, $2::uuid, $3, $4, 'AJUSTE', $5, 'rendicion_reparto', $6, $7::timestamptz, $8::uuid)`,
        [
          empresaId,
          c.producto_id,
          t.nombre,
          t.sku,
          Math.abs(delta),
          `Rendición ${repartoQ.rows[0].camion}: ${c.motivo ?? "sin motivo"}`,
          fechaIso,
          ubicacionId,
        ]
      );
    }

    // Consolida el acumulado con lo realmente vendido, para que el histórico
    // quede firme aunque alguna venta lo haya dejado atrasado.
    await client.query(
      `UPDATE ${tS} rs
          SET cantidad_vendida = COALESCE((
                SELECT sum(vi.cantidad)
                  FROM ${tVI} vi
                  JOIN ${tV} v ON v.id = vi.venta_id
                 WHERE v.reparto_id = rs.reparto_id
                   AND vi.producto_id = rs.producto_id
                   AND COALESCE(v.estado, '') <> 'anulada'
              ), 0),
              updated_at = now()
        WHERE rs.reparto_id = $1::uuid`,
      [id]
    );

    await client.query(
      `UPDATE ${tR}
          SET estado = 'cerrado', cerrado_at = now(), merma_kg = $2, notas_cierre = $3,
              updated_at = now()
        WHERE id = $1::uuid`,
      [id, merma, notas]
    );

    await client.query("COMMIT");
    return NextResponse.json(
      successResponse({ reparto_id: id, estado: "cerrado", con_diferencia: conDiferencia })
    );
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[/api/repartos/[id]/cerrar POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cerrar el reparto."), { status: 500 });
  } finally {
    client?.release();
  }
}
