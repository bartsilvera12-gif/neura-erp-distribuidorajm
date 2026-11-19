import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const runtime = "nodejs";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const TZ = "America/Asuncion";

/**
 * GET /api/reportes/ventas-camion?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * Ventas (sin anuladas) del período agrupadas por camión y, dentro de cada uno,
 * por producto: cantidad vendida e importe. Las ventas sin reparto salen como «Sin camión».
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuthWithRol(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Sin conexión a la base."), { status: 503 });
    const sp = request.nextUrl.searchParams;
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
    const desde = FECHA.test(sp.get("desde") ?? "") ? sp.get("desde")! : `${hoy.slice(0, 8)}01`;
    const hasta = FECHA.test(sp.get("hasta") ?? "") ? sp.get("hasta")! : hoy;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id));
    const tV = quoteSchemaTable(schema, "ventas");
    const tI = quoteSchemaTable(schema, "ventas_items");
    const tR = quoteSchemaTable(schema, "repartos");
    const tC = quoteSchemaTable(schema, "camiones");

    const r = await pool.query<{
      camion_id: string | null;
      camion: string | null;
      producto: string;
      cantidad: string;
      importe: string;
      ventas: string;
    }>(
      `SELECT c.id::text AS camion_id, c.alias AS camion, i.producto_nombre AS producto,
              SUM(i.cantidad)::text AS cantidad, SUM(i.total_linea)::text AS importe,
              COUNT(DISTINCT v.id)::text AS ventas
         FROM ${tV} v
         JOIN ${tI} i ON i.venta_id = v.id
         LEFT JOIN ${tR} r ON r.id = v.reparto_id
         LEFT JOIN ${tC} c ON c.id = r.camion_id
        WHERE v.empresa_id = $1::uuid
          AND COALESCE(v.estado, '') <> 'anulada'
          AND (v.fecha AT TIME ZONE '${TZ}')::date >= $2::date
          AND (v.fecha AT TIME ZONE '${TZ}')::date <= $3::date
        GROUP BY c.id, c.alias, i.producto_nombre
        ORDER BY c.alias NULLS LAST, SUM(i.total_linea) DESC`,
      [ctx.auth.empresa_id, desde, hasta]
    );

    const porCamion = new Map<
      string,
      { camion_id: string | null; camion: string; total: number; cantidad: number; productos: { producto: string; cantidad: number; importe: number }[] }
    >();
    for (const x of r.rows) {
      const k = x.camion_id ?? "sin-camion";
      let g = porCamion.get(k);
      if (!g) {
        g = { camion_id: x.camion_id, camion: x.camion ?? "Sin camión", total: 0, cantidad: 0, productos: [] };
        porCamion.set(k, g);
      }
      const cantidad = Number(x.cantidad) || 0;
      const importe = Number(x.importe) || 0;
      g.total += importe;
      g.cantidad += cantidad;
      g.productos.push({ producto: x.producto, cantidad, importe });
    }
    return NextResponse.json(successResponse({ desde, hasta, camiones: [...porCamion.values()] }));
  } catch (e) {
    console.error("[/api/reportes/ventas-camion]", e instanceof Error ? e.message : e);
    return NextResponse.json(errorResponse("No se pudieron leer las ventas por camión."), { status: 500 });
  }
}
