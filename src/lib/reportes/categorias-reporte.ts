import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { hoyEnAsuncion, mesEnCursoAsuncion } from "@/lib/reportes/ventas-reporte";

/**
 * Reporte de Ventas y Compras por CATEGORÍA de producto.
 *
 * Agrupa los importes de `ventas_items` y `compra_items` por la categoría
 * principal del producto (`productos.categoria_principal_id` →
 * `categorias_productos.nombre`). Lo que no tiene categoría cae en "Sin
 * categoría", para que los totales cuadren con el período.
 *
 * El día es el de Asunción (igual que el reporte de ventas) y las ventas o
 * compras anuladas no cuentan. Solo lectura.
 */

const TZ = "America/Asuncion";
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const SIN_CAT = "Sin categoría";

export { hoyEnAsuncion, mesEnCursoAsuncion };

export type FilaCategoria = {
  categoria: string;
  ventas: number;
  compras: number;
};

export type ReporteCategorias = {
  desde: string;
  hasta: string;
  generado_at: string;
  disponible: boolean;
  resumen: { ventas_total: number; compras_total: number };
  filas: FilaCategoria[];
};

export interface FiltrosCategorias {
  desde: string;
  hasta: string;
}

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

async function existe(schema: string, tabla: string): Promise<boolean> {
  const r = await queryWithRetry<{ t: string | null }>(
    pool(),
    `SELECT to_regclass($1)::text AS t`,
    [`${schema}.${tabla}`]
  );
  return !!r.rows[0]?.t;
}

export async function getReporteCategorias(
  schemaRaw: string,
  empresaId: string,
  f: FiltrosCategorias
): Promise<ReporteCategorias> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const generado_at = new Date().toISOString();
  const base = { desde: f.desde, hasta: f.hasta, generado_at };

  const tProd = quoteSchemaTable(schema, "productos");
  const tCat = quoteSchemaTable(schema, "categorias_productos");

  const porCategoria = new Map<string, FilaCategoria>();
  const fila = (cat: string): FilaCategoria => {
    const prev = porCategoria.get(cat);
    if (prev) return prev;
    const nueva = { categoria: cat, ventas: 0, compras: 0 };
    porCategoria.set(cat, nueva);
    return nueva;
  };

  const hayVentas = await existe(schema, "ventas_items");
  const hayCompras = await existe(schema, "compras");

  if (hayVentas) {
    const tVI = quoteSchemaTable(schema, "ventas_items");
    const tV = quoteSchemaTable(schema, "ventas");
    const { rows } = await queryWithRetry<{ categoria: string | null; monto: string }>(
      pool(),
      `SELECT COALESCE(cat.nombre, $4) AS categoria,
              COALESCE(SUM(vi.total_linea), 0) AS monto
         FROM ${tVI} vi
         JOIN ${tV} v ON v.id = vi.venta_id
         LEFT JOIN ${tProd} p ON p.id = vi.producto_id
         LEFT JOIN ${tCat} cat ON cat.id = p.categoria_principal_id
        WHERE vi.empresa_id = $1::uuid
          AND COALESCE(v.estado, '') <> 'anulada'
          AND (v.fecha AT TIME ZONE $5)::date BETWEEN $2::date AND $3::date
        GROUP BY 1`,
      [empresaId, f.desde, f.hasta, SIN_CAT, TZ]
    );
    for (const r of rows) fila(r.categoria ?? SIN_CAT).ventas += num(r.monto);
  }

  if (hayCompras) {
    const tCI = quoteSchemaTable(schema, "compra_items");
    const tC = quoteSchemaTable(schema, "compras");
    const { rows } = await queryWithRetry<{ categoria: string | null; monto: string }>(
      pool(),
      `SELECT COALESCE(cat.nombre, $4) AS categoria,
              COALESCE(SUM(ci.total_linea), 0) AS monto
         FROM ${tCI} ci
         JOIN ${tC} c ON c.id = ci.compra_id
         LEFT JOIN ${tProd} p ON p.id = ci.producto_id
         LEFT JOIN ${tCat} cat ON cat.id = p.categoria_principal_id
        WHERE ci.empresa_id = $1::uuid
          AND COALESCE(c.estado, '') <> 'anulada'
          AND (c.fecha AT TIME ZONE $5)::date BETWEEN $2::date AND $3::date
        GROUP BY 1`,
      [empresaId, f.desde, f.hasta, SIN_CAT, TZ]
    );
    for (const r of rows) fila(r.categoria ?? SIN_CAT).compras += num(r.monto);
  }

  const filas = [...porCategoria.values()].sort((a, b) => b.ventas - a.ventas || b.compras - a.compras);
  const resumen = filas.reduce(
    (acc, r) => ({ ventas_total: acc.ventas_total + r.ventas, compras_total: acc.compras_total + r.compras }),
    { ventas_total: 0, compras_total: 0 }
  );

  return { ...base, disponible: hayVentas || hayCompras, resumen, filas };
}
