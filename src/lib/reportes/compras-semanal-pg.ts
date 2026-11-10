import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { armarSemanas, type CompraDia, type ComprasSemanal } from "@/lib/reportes/compras-semanal";

/**
 * Compras de un mes armadas como la planilla de Excel de la distribuidora
 * («COMPRA LA BLANCA»): por semana, una columna por día con el N° de factura y
 * el monto, el total del día, el total de la semana y el del mes.
 *
 * Con proveedor y/o categoría se filtra igual que el reporte de compras: con
 * categoría, el monto de cada compra es solo el de sus líneas de esa categoría.
 */
const TZ = "America/Asuncion";

export async function getComprasSemanal(
  schemaRaw: string,
  empresaId: string,
  f: { mes: string; proveedor_id?: string | null; categoria_id?: string | null }
): Promise<ComprasSemanal> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Pool no disponible.");
  const [anio, mes] = f.mes.split("-").map(Number);
  const desde = `${f.mes}-01`;
  const hasta = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
  // Para el gráfico: los 12 meses que terminan en este.
  const desde12 = new Date(Date.UTC(anio, mes - 12, 1)).toISOString().slice(0, 10);

  const ex = await queryWithRetry<{ t: string | null }>(pool, `SELECT to_regclass($1)::text AS t`, [`${schema}.compras`]);
  if (!ex.rows[0]?.t) return armarSemanas(f.mes, [], []);

  const tC = quoteSchemaTable(schema, "compras");
  const tItems = quoteSchemaTable(schema, "compra_items");

  const params: unknown[] = [empresaId, desde12, hasta, TZ];
  let filtro = "";
  if (f.proveedor_id) {
    params.push(f.proveedor_id);
    filtro += ` AND c.proveedor_id = $${params.length}::uuid`;
  }
  let cte = "";
  let monto = "c.total";
  let join = "";
  if (f.categoria_id) {
    params.push(f.categoria_id);
    const tCat = quoteSchemaTable(schema, "categorias_productos");
    cte = `WITH RECURSIVE cats AS (
             SELECT id FROM ${tCat} WHERE id = $${params.length}::uuid AND empresa_id = $1::uuid
             UNION SELECT h.id FROM ${tCat} h JOIN cats ON h.parent_id = cats.id
           ),
           lineas AS (
             SELECT ci.compra_id, COALESCE(sum(ci.total_linea), 0) AS total
               FROM ${tItems} ci JOIN ${quoteSchemaTable(schema, "productos")} p ON p.id = ci.producto_id
              WHERE p.categoria_principal_id IN (SELECT id FROM cats)
              GROUP BY ci.compra_id
           )`;
    monto = "l.total";
    join = "JOIN lineas l ON l.compra_id = c.id";
  }

  const { rows } = await queryWithRetry<{
    id: string;
    fecha: string;
    numero: string | null;
    proveedor: string | null;
    total: string;
  }>(
    pool,
    `${cte}
     SELECT c.id,
            to_char((c.fecha AT TIME ZONE $4)::date, 'YYYY-MM-DD') AS fecha,
            COALESCE(NULLIF(btrim(to_jsonb(c)->>'numero_factura'), ''),
                     NULLIF(btrim(to_jsonb(c)->>'numero_comprobante'), ''),
                     NULLIF(btrim(to_jsonb(c)->>'numero_control'), '')) AS numero,
            c.proveedor_nombre AS proveedor,
            ${monto}::text AS total
       FROM ${tC} c ${join}
      WHERE c.empresa_id = $1::uuid
        AND COALESCE(c.estado, '') <> 'anulada'
        AND (c.fecha AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
        ${filtro}
      ORDER BY (c.fecha AT TIME ZONE $4)::date, c.created_at`,
    params
  );

  const delMes: CompraDia[] = [];
  const porMes = new Map<string, number>();
  for (const r of rows) {
    const total = Number(r.total) || 0;
    const m = r.fecha.slice(0, 7);
    porMes.set(m, (porMes.get(m) ?? 0) + total);
    if (r.fecha >= desde) delMes.push({ id: r.id, fecha: r.fecha, numero: r.numero, proveedor: r.proveedor, total });
  }
  // Los 12 meses, aunque alguno no tenga compras (barra en cero).
  const meses: { mes: string; total: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(anio, mes - 1 - i, 1));
    const k = d.toISOString().slice(0, 7);
    meses.push({ mes: k, total: porMes.get(k) ?? 0 });
  }
  return armarSemanas(f.mes, delMes, meses);
}
