import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { hoyEnAsuncion, mesEnCursoAsuncion } from "@/lib/reportes/ventas-reporte";

/**
 * Reporte de Compras operativo (NO fiscal).
 *
 * A diferencia del Libro de Compras —que es el Libro IVA y solo lista
 * documentos con timbrado—, este reporte muestra TODAS las compras válidas del
 * período, tengan o no timbrado. Es el que usa el negocio para ver qué compró,
 * a quién y por cuánto; la distribuidora carga la mayoría de sus compras sin
 * comprobante timbrado, así que en el Libro fiscal no aparecen.
 *
 * `compras` es un registro por documento y `compras.total` es el total del
 * documento (= suma de sus `compra_items`), así que sumar `total` no duplica.
 * El día es el de Asunción, igual que el reporte de ventas. Las anuladas no
 * cuentan. Solo lectura.
 */

const TZ = "America/Asuncion";
const num = (v: unknown): number => (v == null ? 0 : Number(v));

export { hoyEnAsuncion, mesEnCursoAsuncion };

export type FilaCompra = {
  id: string;
  fecha: string | null;
  proveedor: string | null;
  proveedor_id: string | null;
  ruc: string | null;
  numero: string | null;
  condicion: string | null;
  estado: string | null;
  items: number;
  total: number;
};

export type CorteProveedor = {
  proveedor: string;
  proveedor_id: string | null;
  compras: number;
  total: number;
};

export type ReporteCompras = {
  desde: string;
  hasta: string;
  generado_at: string;
  /** `false` si el schema no tiene la tabla `compras`: la pantalla lo dice en vez de fallar. */
  disponible: boolean;
  resumen: {
    compras: number;
    total: number;
    contado: number;
    credito: number;
  };
  por_proveedor: CorteProveedor[];
  filas: FilaCompra[];
};

export interface FiltrosCompras {
  desde: string;
  hasta: string;
  proveedor_id?: string | null;
}

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

export async function getReporteCompras(
  schemaRaw: string,
  empresaId: string,
  f: FiltrosCompras
): Promise<ReporteCompras> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const generado_at = new Date().toISOString();
  const base: Omit<ReporteCompras, "disponible" | "filas" | "por_proveedor" | "resumen"> = {
    desde: f.desde,
    hasta: f.hasta,
    generado_at,
  };
  const vacio: ReporteCompras = {
    ...base,
    disponible: false,
    resumen: { compras: 0, total: 0, contado: 0, credito: 0 },
    por_proveedor: [],
    filas: [],
  };

  const existe = await queryWithRetry<{ t: string | null }>(
    pool(),
    `SELECT to_regclass($1)::text AS t`,
    [`${schema}.compras`]
  );
  if (!existe.rows[0]?.t) return vacio;

  const tC = quoteSchemaTable(schema, "compras");
  const tItems = quoteSchemaTable(schema, "compra_items");
  const tPr = quoteSchemaTable(schema, "proveedores");

  const params: unknown[] = [empresaId, f.desde, f.hasta];
  let filtroProveedor = "";
  if (f.proveedor_id) {
    params.push(f.proveedor_id);
    filtroProveedor = ` AND c.proveedor_id = $${params.length}::uuid`;
  }

  const { rows } = await queryWithRetry<FilaCompra>(
    pool(),
    `SELECT c.id,
            to_char((c.fecha AT TIME ZONE $${params.length + 1})::date, 'YYYY-MM-DD') AS fecha,
            c.proveedor_nombre AS proveedor,
            c.proveedor_id AS proveedor_id,
            pr.ruc AS ruc,
            COALESCE(NULLIF(btrim(c.numero_factura), ''),
                     NULLIF(btrim(c.numero_comprobante), ''),
                     NULLIF(btrim(c.numero_control), '')) AS numero,
            c.tipo_pago AS condicion,
            c.estado AS estado,
            (SELECT count(*)::int FROM ${tItems} ci WHERE ci.compra_id = c.id) AS items,
            c.total AS total
       FROM ${tC} c
       LEFT JOIN ${tPr} pr ON pr.id = c.proveedor_id
      WHERE c.empresa_id = $1::uuid
        AND COALESCE(c.estado, '') <> 'anulada'
        AND (c.fecha AT TIME ZONE $${params.length + 1})::date BETWEEN $2::date AND $3::date
        ${filtroProveedor}
      ORDER BY (c.fecha AT TIME ZONE $${params.length + 1})::date DESC, c.total DESC`,
    [...params, TZ]
  );

  const filas: FilaCompra[] = rows.map((r) => ({
    id: r.id,
    fecha: r.fecha,
    proveedor: r.proveedor,
    proveedor_id: r.proveedor_id,
    ruc: r.ruc,
    numero: r.numero,
    condicion: r.condicion,
    estado: r.estado,
    items: num(r.items),
    total: num(r.total),
  }));

  // Resumen y corte por proveedor se calculan sobre las filas ya traídas: es
  // exacto y evita consultas extra.
  const esCredito = (c: string | null) => /cr[eé]d/i.test(c ?? "");
  const esContado = (c: string | null) => /contado/i.test(c ?? "");
  let total = 0;
  let contado = 0;
  let credito = 0;
  const porProv = new Map<string, CorteProveedor>();
  for (const r of filas) {
    total += r.total;
    if (esCredito(r.condicion)) credito += r.total;
    else if (esContado(r.condicion)) contado += r.total;
    const clave = r.proveedor_id ?? `nombre:${r.proveedor ?? "—"}`;
    const prev = porProv.get(clave);
    if (prev) {
      prev.compras += 1;
      prev.total += r.total;
    } else {
      porProv.set(clave, {
        proveedor: r.proveedor ?? "—",
        proveedor_id: r.proveedor_id,
        compras: 1,
        total: r.total,
      });
    }
  }

  const por_proveedor = [...porProv.values()].sort((a, b) => b.total - a.total);

  return {
    ...base,
    disponible: true,
    resumen: { compras: filas.length, total, contado, credito },
    por_proveedor,
    filas,
  };
}
