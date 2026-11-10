import "server-only";
import type { Pool } from "pg";
import { quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import type { VentaConDescuento } from "@/lib/ventas/descuentos-reporte";

const TZ = "America/Asuncion";
const NOMBRE_CLIENTE = `COALESCE(NULLIF(btrim(to_jsonb(c)->>'razon_social'), ''), NULLIF(btrim(to_jsonb(c)->>'nombre'), ''),
  NULLIF(btrim(to_jsonb(c)->>'empresa'), ''), NULLIF(btrim(to_jsonb(c)->>'nombre_contacto'), ''))`;

async function columnas(pool: Pool, schema: string, tabla: string): Promise<Set<string>> {
  const r = await pool.query<{ c: string }>(
    `SELECT column_name AS c FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
    [schema, tabla]
  );
  return new Set(r.rows.map((x) => x.c));
}

/** «Descuento 2% (Gs. 52.000)…» en las observaciones (ventas de antes del SQL 62). */
function desdeObservaciones(obs: string | null): { monto: number; porcentaje: number } | null {
  const m = /Descuento ([\d.,]+)% \(Gs\. ([\d.]+)\)/.exec(obs ?? "");
  if (!m) return null;
  return {
    monto: Number(m[2].replace(/\./g, "")) || 0,
    porcentaje: Number(m[1].replace(/\./g, "").replace(",", ".")) || 0,
  };
}

/**
 * Ventas con descuento (sin anuladas): de una caja, o de un rango de fechas
 * (días de Asunción). Lee las columnas del SQL 62/63 si están y, si no, lo que
 * quedó escrito en las observaciones.
 */
export async function ventasConDescuento(
  pool: Pool,
  schemaRaw: string,
  empresaId: string,
  filtro: { cajaId?: string; desde?: string; hasta?: string }
): Promise<VentaConDescuento[]> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tV = quoteSchemaTable(schema, "ventas");
  const colsV = await columnas(pool, schema, "ventas");
  const tieneMonto = colsV.has("descuento_monto");
  const tieneUsuario = colsV.has("descuento_usuario");
  const tieneCaja = colsV.has("caja_id");
  if (filtro.cajaId && !tieneCaja) return [];

  const conFactura = colsV.has("factura_id") && !!(await pool.query(`SELECT to_regclass($1) AS t`, [`${schema}.facturas`])).rows[0]?.t;
  const cajasCols = tieneCaja ? await columnas(pool, schema, "cajas") : new Set<string>();
  const dueno = cajasCols.has("abierta_por") ? "k.abierta_por" : cajasCols.has("usuario_id") ? "k.usuario_id" : null;

  const params: unknown[] = [empresaId];
  const conds = [`v.empresa_id = $1::uuid`, `COALESCE(v.estado, '') <> 'anulada'`];
  conds.push(
    tieneMonto
      ? `(COALESCE(v.descuento_monto, 0) > 0 OR v.observaciones LIKE 'Descuento %')`
      : `v.observaciones LIKE 'Descuento %'`
  );
  if (filtro.cajaId) {
    params.push(filtro.cajaId);
    conds.push(`v.caja_id = $${params.length}::uuid`);
  }
  if (filtro.desde) {
    params.push(filtro.desde);
    conds.push(`(v.fecha AT TIME ZONE '${TZ}')::date >= $${params.length}::date`);
  }
  if (filtro.hasta) {
    params.push(filtro.hasta);
    conds.push(`(v.fecha AT TIME ZONE '${TZ}')::date <= $${params.length}::date`);
  }

  const r = await pool.query<{
    id: string;
    numero_control: string;
    factura: string | null;
    fecha: string;
    cliente: string | null;
    ruc: string | null;
    tipo_venta: string;
    total: string;
    descuento_monto: string | null;
    descuento_porcentaje: string | null;
    observaciones: string | null;
    usuario: string | null;
    dueno: string | null;
    caja_numero: number | null;
  }>(
    `SELECT v.id, v.numero_control,
            ${conFactura ? `to_jsonb(f)->>'numero_factura'` : "NULL::text"} AS factura,
            to_char(v.fecha AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS fecha, ${NOMBRE_CLIENTE} AS cliente,
            COALESCE(NULLIF(btrim(to_jsonb(c)->>'ruc_factura'), ''), NULLIF(btrim(to_jsonb(c)->>'ruc'), ''),
                     NULLIF(btrim(to_jsonb(c)->>'documento'), '')) AS ruc,
            v.tipo_venta, v.total::text AS total,
            ${tieneMonto ? "v.descuento_monto::text" : "NULL::text"} AS descuento_monto,
            ${tieneMonto && colsV.has("descuento_porcentaje") ? "v.descuento_porcentaje::text" : "NULL::text"} AS descuento_porcentaje,
            v.observaciones,
            ${tieneUsuario ? "v.descuento_usuario" : "NULL::text"} AS usuario,
            ${dueno ? `${dueno}::text` : "NULL::text"} AS dueno,
            ${tieneCaja ? "k.numero_caja" : "NULL::int"} AS caja_numero
       FROM ${tV} v
       LEFT JOIN ${quoteSchemaTable(schema, "clientes")} c ON c.id = v.cliente_id
       ${conFactura ? `LEFT JOIN ${quoteSchemaTable(schema, "facturas")} f ON f.id = v.factura_id` : ""}
       ${tieneCaja ? `LEFT JOIN ${quoteSchemaTable(schema, "cajas")} k ON k.id = v.caja_id` : ""}
      WHERE ${conds.join(" AND ")}
      ORDER BY v.fecha DESC
      LIMIT 2000`,
    params
  );

  // Ventas sin quién aplicó (antes del SQL 63): quien tenía la caja.
  const duenos = [...new Set(r.rows.filter((x) => !x.usuario && x.dueno).map((x) => x.dueno as string))];
  const nombreDe = new Map<string, string>();
  if (duenos.length > 0) {
    try {
      const { data } = await createServiceRoleClient().from("usuarios").select("id, nombre, email").in("id", duenos);
      for (const u of (data ?? []) as { id: string; nombre?: string | null; email?: string | null }[]) {
        nombreDe.set(u.id, u.nombre?.trim() || u.email || "");
      }
    } catch {
      /* sin nombre: sale vacío */
    }
  }

  const out: VentaConDescuento[] = [];
  for (const x of r.rows) {
    let monto = Number(x.descuento_monto ?? 0) || 0;
    let porcentaje = Number(x.descuento_porcentaje ?? 0) || 0;
    if (!(monto > 0)) {
      const o = desdeObservaciones(x.observaciones);
      if (!o) continue;
      monto = o.monto;
      porcentaje = o.porcentaje;
    }
    const cobrado = Number(x.total) || 0;
    out.push({
      venta_id: x.id,
      numero_venta: x.numero_control,
      factura: x.factura,
      fecha: x.fecha,
      cliente: x.cliente ?? "Sin nombre",
      ruc: x.ruc,
      tipo_venta: x.tipo_venta === "CREDITO" ? "CREDITO" : "CONTADO",
      original: cobrado + monto,
      porcentaje,
      monto,
      cobrado,
      usuario: x.usuario || (x.dueno ? nombreDe.get(x.dueno) || null : null),
      caja_numero: x.caja_numero,
    });
  }
  return out;
}
