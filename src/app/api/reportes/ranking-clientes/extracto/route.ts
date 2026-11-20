import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { buildXlsxBuffer, xlsxResponseHeaders } from "@/lib/excel/export";
import { extractoClientePdf, type ExtractoFila } from "@/lib/reportes/extracto-cliente-pdf";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/reportes/ranking-clientes/extracto
 *
 * Extracto de ventas de un cliente (todas las facturas no anuladas del período).
 *   ?buscar=texto            → lista de clientes para el buscador.
 *   ?cliente_id=…&desde=…&hasta=…&vendedor=…&camion_id=…&formato=json|pdf|xlsx
 * Solo lectura: no modifica ningún dato.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

    const sp = request.nextUrl.searchParams;
    const tV = quoteSchemaTable(schema, "ventas");
    const tC = quoteSchemaTable(schema, "clientes");
    const tF = quoteSchemaTable(schema, "facturas");
    const tR = quoteSchemaTable(schema, "repartos");
    const tK = quoteSchemaTable(schema, "camiones");

    const colsQ = await queryWithRetry<{ c: string }>(
      pool,
      `SELECT column_name AS c FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'clientes'`,
      [schema]
    );
    const hay = new Set(colsQ.rows.map((r) => r.c));
    const partes = ["empresa", "nombre_contacto", "razon_social", "nombre"]
      .filter((c) => hay.has(c))
      .map((c) => `NULLIF(btrim(cl.${c}), '')`);
    const exprNombre = partes.length === 0
      ? `'Cliente'`
      : hay.has("tipo_cliente") && hay.has("nombre_contacto")
        ? `CASE WHEN lower(coalesce(cl.tipo_cliente,'')) = 'persona'
                THEN COALESCE(NULLIF(btrim(cl.nombre_contacto), ''), ${partes.join(", ")}, 'Cliente')
                ELSE COALESCE(${partes.join(", ")}, 'Cliente') END`
        : `COALESCE(${partes.join(", ")}, 'Cliente')`;
    const rucCols = ["ruc_factura", "ruc", "documento"].filter((c) => hay.has(c));
    const exprRuc = rucCols.length > 0
      ? `COALESCE(${rucCols.map((c) => `NULLIF(btrim(cl.${c}), '')`).join(", ")})`
      : `NULL::text`;

    // Buscador de clientes.
    const buscar = (sp.get("buscar") ?? "").trim();
    if (sp.has("buscar")) {
      const { rows } = await queryWithRetry<{ id: string; nombre: string; ruc: string | null }>(
        pool,
        `SELECT cl.id, ${exprNombre} AS nombre, ${exprRuc} AS ruc
           FROM ${tC} cl
          WHERE cl.empresa_id = $1::uuid
            AND (${exprNombre} ILIKE $2 OR COALESCE(${exprRuc}, '') ILIKE $2)
          ORDER BY 2
          LIMIT 20`,
        [empresaId, `%${buscar}%`]
      );
      return NextResponse.json(successResponse({ clientes: rows }));
    }

    const clienteId = (sp.get("cliente_id") ?? "").trim();
    if (!UUID_RE.test(clienteId)) return NextResponse.json(errorResponse("Elegí un cliente."), { status: 400 });
    const desde = (sp.get("desde") ?? "").trim();
    const hasta = (sp.get("hasta") ?? "").trim();
    const vendedor = (sp.get("vendedor") ?? "").trim();
    const camionId = (sp.get("camion_id") ?? "").trim();
    const formato = sp.get("formato") ?? "json";

    const params: unknown[] = [empresaId, clienteId];
    const cond: string[] = [];
    if (FECHA_RE.test(desde)) { params.push(desde); cond.push(`v.fecha >= $${params.length}::date`); }
    if (FECHA_RE.test(hasta)) { params.push(hasta); cond.push(`v.fecha < ($${params.length}::date + interval '1 day')`); }
    if (vendedor) { params.push(vendedor); cond.push(`COALESCE(v.vendedor_nombre, v.usuario_nombre, '') = $${params.length}`); }
    if (UUID_RE.test(camionId)) { params.push(camionId); cond.push(`rp.camion_id = $${params.length}::uuid`); }

    const { rows: cab } = await queryWithRetry<{ nombre: string; ruc: string | null }>(
      pool,
      `SELECT ${exprNombre} AS nombre, ${exprRuc} AS ruc FROM ${tC} cl WHERE cl.id = $2::uuid AND cl.empresa_id = $1::uuid`,
      [empresaId, clienteId]
    );
    if (!cab[0]) return NextResponse.json(errorResponse("Cliente no encontrado."), { status: 404 });

    const { rows } = await queryWithRetry<Record<string, string | null>>(
      pool,
      `SELECT v.id,
              COALESCE(NULLIF(f.numero_factura, ''), NULLIF(v.numero_sifen, ''), v.numero_control) AS numero,
              v.fecha::text AS fecha,
              COALESCE(NULLIF(v.vendedor_nombre, ''), NULLIF(v.usuario_nombre, '')) AS vendedor,
              k.alias AS camion,
              v.tipo_venta AS condicion,
              v.total::text AS monto
         FROM ${tV} v
         LEFT JOIN ${tF} f ON f.id = v.factura_id
         LEFT JOIN ${tR} rp ON rp.id = v.reparto_id
         LEFT JOIN ${tK} k ON k.id = rp.camion_id
        WHERE v.empresa_id = $1::uuid
          AND v.cliente_id = $2::uuid
          AND COALESCE(v.estado, '') <> 'anulada'
          ${cond.map((c) => "AND " + c).join(" ")}
        ORDER BY v.fecha ASC, v.numero_control ASC`,
      params
    );
    const filas: ExtractoFila[] = rows.map((r) => ({
      numero: String(r.numero ?? ""),
      fecha: String(r.fecha ?? "").slice(0, 10),
      vendedor: r.vendedor ?? "",
      camion: r.camion ?? "",
      condicion: String(r.condicion ?? "").toUpperCase() === "CREDITO" ? "Crédito" : "Contado",
      monto: Number(r.monto) || 0,
    }));
    const total = filas.reduce((s, f) => s + f.monto, 0);
    const cliente = { nombre: cab[0].nombre, ruc: cab[0].ruc };

    if (formato === "xlsx") {
      const buf = buildXlsxBuffer(
        filas,
        [
          { header: "Factura", value: (f) => f.numero, width: 20 },
          { header: "Fecha", value: (f) => f.fecha, width: 12 },
          { header: "Vendedor", value: (f) => f.vendedor, width: 22 },
          { header: "Camión", value: (f) => f.camion, width: 16 },
          { header: "Condición", value: (f) => f.condicion, width: 12 },
          { header: "Monto", value: (f) => f.monto, width: 16 },
        ],
        { sheetName: "Extracto" }
      );
      return new NextResponse(new Uint8Array(buf), {
        headers: xlsxResponseHeaders(`extracto_${cliente.nombre.slice(0, 30)}_${desde || "inicio"}_${hasta || "hoy"}`),
      });
    }
    if (formato === "pdf") {
      const bytes = await extractoClientePdf({ cliente, desde, hasta, vendedor, filas, total });
      const safe = `extracto_${cliente.nombre.slice(0, 30)}`.replace(/[^a-zA-Z0-9_.-]+/g, "_");
      return new NextResponse(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${safe}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Filtros disponibles (vendedores y camiones) para los desplegables.
    const vend = await queryWithRetry<{ n: string }>(
      pool,
      `SELECT DISTINCT COALESCE(NULLIF(vendedor_nombre, ''), NULLIF(usuario_nombre, '')) AS n
         FROM ${tV} WHERE empresa_id = $1::uuid AND COALESCE(NULLIF(vendedor_nombre, ''), NULLIF(usuario_nombre, '')) IS NOT NULL ORDER BY 1`,
      [empresaId]
    );
    const cam = await queryWithRetry<{ id: string; alias: string }>(
      pool, `SELECT id, alias FROM ${tK} WHERE empresa_id = $1::uuid ORDER BY alias`, [empresaId]
    );
    return NextResponse.json(successResponse({
      cliente, filas, total, vendedores: vend.rows.map((r) => r.n), camiones: cam.rows,
    }));
  } catch (err) {
    console.error("[/api/reportes/ranking-clientes/extracto GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo generar el extracto."), { status: 500 });
  }
}
