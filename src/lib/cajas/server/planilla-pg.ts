import "server-only";
import type { Pool } from "pg";
import { quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { resolverUsuarioTenant } from "@/lib/usuarios/server/usuario-tenant";
import type { PlanillaArqueo, RenglonPlanilla } from "@/lib/cajas/planilla";
import type { ConteoEfectivo } from "@/lib/cajas/conteo";
import type { DatosPlanilla, EstadoPlanilla, PlanillaGuardada, PlanillaResumen } from "@/lib/cajas/planilla";
import { totalesPlanilla } from "@/lib/cajas/planilla";
import { limpiarConteo, totalConteo } from "@/lib/cajas/conteo";

async function columnas(pool: Pool, schema: string, tabla: string): Promise<Set<string>> {
  const r = await pool.query<{ c: string }>(
    `SELECT column_name AS c FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
    [schema, tabla]
  );
  return new Set(r.rows.map((x) => x.c));
}
async function existe(pool: Pool, schema: string, tabla: string): Promise<boolean> {
  const r = await pool.query<{ t: string | null }>(`SELECT to_regclass($1)::text AS t`, [`${schema}.${tabla}`]);
  return !!r.rows[0]?.t;
}

/** «001-001-0009564» → «9564»: así lo anotan en la planilla. */
function facturaCorta(n: string | null): string | null {
  if (!n) return null;
  const ult = n.split("-").pop() ?? n;
  return /^\d+$/.test(ult) ? String(Number(ult)) : n;
}

const NOMBRE_CLIENTE = `COALESCE(NULLIF(btrim(to_jsonb(c)->>'razon_social'), ''), NULLIF(btrim(to_jsonb(c)->>'nombre'), ''),
  NULLIF(btrim(to_jsonb(c)->>'empresa'), ''), NULLIF(btrim(to_jsonb(c)->>'nombre_contacto'), ''))`;

export async function planillaArqueo(
  pool: Pool,
  schemaRaw: string,
  empresaId: string,
  cajaId: string
): Promise<PlanillaArqueo | null> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tC = quoteSchemaTable(schema, "cajas");
  const tM = quoteSchemaTable(schema, "caja_movimientos");
  const tV = quoteSchemaTable(schema, "ventas");
  const tCl = quoteSchemaTable(schema, "clientes");

  const colsC = await columnas(pool, schema, "cajas");
  const dueno = colsC.has("abierta_por") ? "abierta_por" : colsC.has("usuario_id") ? "usuario_id" : null;
  const cq = await pool.query<{
    id: string;
    numero_caja: number;
    estado: string;
    fecha_apertura: string;
    fecha_cierre: string | null;
    monto_apertura: string;
    sencillo: string;
    conteo: ConteoEfectivo | null;
    dueno: string | null;
  }>(
    `SELECT id, numero_caja, estado, fecha_apertura::text AS fecha_apertura, fecha_cierre::text AS fecha_cierre,
            monto_apertura::text AS monto_apertura,
            ${colsC.has("sencillo") ? "COALESCE(sencillo, 0)::text" : "'0'"} AS sencillo,
            ${colsC.has("conteo_efectivo") ? "conteo_efectivo" : "NULL::jsonb"} AS conteo,
            ${dueno ? `${dueno}::text` : "NULL::text"} AS dueno
       FROM ${tC} WHERE id = $1::uuid AND empresa_id = $2::uuid`,
    [cajaId, empresaId]
  );
  const c = cq.rows[0];
  if (!c) return null;

  // Número de factura de la venta, si tiene (la electrónica o la común).
  const colsV = await columnas(pool, schema, "ventas");
  const conFactura = colsV.has("factura_id") && (await existe(pool, schema, "facturas"));
  const joinFactura = conFactura
    ? `LEFT JOIN ${quoteSchemaTable(schema, "facturas")} f ON f.id = v.factura_id`
    : "";
  const numeroFactura = conFactura ? "COALESCE(to_jsonb(f)->>'numero_factura', v.numero_control)" : "v.numero_control";

  const movs = await pool.query<{
    tipo: string;
    concepto: string | null;
    medio: string;
    monto: string;
    venta_id: string | null;
    tipo_venta: string | null;
    factura: string | null;
    cliente: string | null;
  }>(
    `SELECT m.tipo, m.concepto, lower(btrim(COALESCE(m.medio_pago, ''))) AS medio, m.monto::text AS monto,
            m.venta_id, v.tipo_venta, ${numeroFactura} AS factura, ${NOMBRE_CLIENTE} AS cliente
       FROM ${tM} m
       LEFT JOIN ${tV} v ON v.id = m.venta_id
       ${joinFactura}
       LEFT JOIN ${tCl} c ON c.id = v.cliente_id
      WHERE m.empresa_id = $1::uuid AND m.caja_id = $2::uuid AND m.anulado_at IS NULL
      ORDER BY m.created_at`,
    [empresaId, cajaId]
  );

  let contado = 0;
  let cheques = 0;
  let otrosMedios = 0;
  const cobranzas: RenglonPlanilla[] = [];
  const otros: RenglonPlanilla[] = [];
  const gastos: RenglonPlanilla[] = [];
  const transferencias: RenglonPlanilla[] = [];
  for (const m of movs.rows) {
    const monto = Number(m.monto);
    if (m.tipo === "ingreso") {
      const nombre = m.venta_id ? (m.cliente ?? "Sin nombre") : (m.concepto ?? "Ingreso");
      if (m.venta_id && m.tipo_venta === "CREDITO") {
        cobranzas.push({ nombre, factura: facturaCorta(m.factura), monto, medio: m.medio });
      } else if (m.venta_id) {
        contado += monto;
      } else {
        otros.push({ nombre, factura: null, monto, medio: m.medio });
      }
      if (m.medio === "transferencia") transferencias.push({ nombre, factura: facturaCorta(m.factura), monto });
      else if (m.medio === "cheque") cheques += monto;
      else if (m.medio !== "efectivo") otrosMedios += monto;
    } else if (m.tipo === "egreso" || m.tipo === "retiro") {
      gastos.push({ nombre: m.concepto ?? (m.tipo === "retiro" ? "Retiro" : "Egreso"), factura: null, monto, medio: m.medio });
    } else if (m.tipo === "ajuste") {
      // El ajuste suma al cajón: en la planilla va restando de los gastos.
      gastos.push({ nombre: `Ajuste: ${m.concepto ?? ""}`.trim(), factura: null, monto: -monto, medio: m.medio });
    }
  }

  // Lo que se fió desde esta caja.
  let credito: RenglonPlanilla[] = [];
  if (colsV.has("caja_id")) {
    const cr = await pool.query<{ cliente: string | null; factura: string | null; total: string }>(
      `SELECT ${NOMBRE_CLIENTE} AS cliente, ${numeroFactura} AS factura, v.total::text AS total
         FROM ${tV} v ${joinFactura}
         LEFT JOIN ${tCl} c ON c.id = v.cliente_id
        WHERE v.empresa_id = $1::uuid AND v.caja_id = $2::uuid AND v.tipo_venta = 'CREDITO'
          AND COALESCE(v.estado, '') <> 'anulada'
        ORDER BY v.fecha`,
      [empresaId, cajaId]
    );
    credito = cr.rows.map((r) => ({ nombre: r.cliente ?? "Sin nombre", factura: facturaCorta(r.factura), monto: Number(r.total) }));
  }

  // Quién la abrió y, si maneja un camión, cuál.
  let responsable: string | null = null;
  let camion: string | null = null;
  if (c.dueno) {
    try {
      const { data } = await createServiceRoleClient()
        .from("usuarios")
        .select("nombre, email")
        .eq("id", c.dueno)
        .maybeSingle();
      const u = (data ?? {}) as { nombre?: string | null; email?: string | null };
      responsable = u.nombre?.trim() || u.email || null;
      if (await existe(pool, schema, "camiones")) {
        const tenant = await resolverUsuarioTenant({ schema, empresaId, email: u.email, catalogId: c.dueno }).catch(() => null);
        const ids = [c.dueno, tenant?.id].filter(Boolean);
        const colsCam = await columnas(pool, schema, "camiones");
        if (colsCam.has("repartidor_id")) {
          const cam = await pool.query<{ alias: string | null }>(
            `SELECT COALESCE(to_jsonb(k)->>'alias', to_jsonb(k)->>'nombre', to_jsonb(k)->>'patente') AS alias
               FROM ${quoteSchemaTable(schema, "camiones")} k
              WHERE k.empresa_id = $1::uuid AND k.repartidor_id::text = ANY($2::text[]) LIMIT 1`,
            [empresaId, ids]
          );
          camion = cam.rows[0]?.alias ?? null;
        }
      }
    } catch {
      /* sin nombre: la planilla sale igual */
    }
  }

  // «Datos para transferencias»: las cuentas propias de la empresa (SQL 33).
  let cuentas: PlanillaArqueo["cuentas"] = [];
  if ((await existe(pool, schema, "bancos")) && (await columnas(pool, schema, "bancos")).has("es_cuenta_propia")) {
    const b = await pool.query<{ j: Record<string, unknown> }>(
      `SELECT to_jsonb(b) AS j FROM ${quoteSchemaTable(schema, "bancos")} b
        WHERE COALESCE(to_jsonb(b)->>'empresa_id', $1) = $1 AND b.es_cuenta_propia
          AND COALESCE((to_jsonb(b)->>'activo')::boolean, true)
        ORDER BY to_jsonb(b)->>'nombre'`,
      [empresaId]
    );
    const t = (j: Record<string, unknown>, k: string) => (typeof j[k] === "string" && (j[k] as string).trim() ? (j[k] as string).trim() : null);
    cuentas = b.rows.map(({ j }) => ({
      banco: t(j, "nombre") ?? "Banco",
      cuenta: t(j, "numero_cuenta"),
      alias: t(j, "alias_cuenta"),
      titular: t(j, "titular_cuenta"),
      documento: t(j, "documento_titular"),
    }));
  }

  return {
    caja: {
      id: c.id,
      numero_caja: Number(c.numero_caja),
      estado: c.estado === "cerrada" ? "cerrada" : "abierta",
      fecha_apertura: c.fecha_apertura,
      fecha_cierre: c.fecha_cierre,
      monto_apertura: Number(c.monto_apertura),
      sencillo: Number(c.sencillo),
    },
    responsable,
    camion,
    conteo: c.conteo ?? null,
    contado,
    credito,
    cobranzas,
    otros_ingresos: otros,
    gastos,
    transferencias,
    cheques,
    otros_medios: otrosMedios,
    cuentas,
  };
}

// ── Planillas guardadas (SQL 58) ─────────────────────────────────────────────


export class PlanillaError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export async function hayPlanillas(pool: Pool, schema: string): Promise<boolean> {
  return existe(pool, schema, "planillas_arqueo");
}

/** Lo que el sistema ya sabe, como punto de partida de la planilla. */
export function datosDesdeSistema(p: PlanillaArqueo): DatosPlanilla {
  return {
    apertura: p.caja.monto_apertura + p.caja.sencillo,
    contado: p.contado,
    conteo: p.conteo ?? { billetes: {}, sencillo: 0, monedas: 0 },
    cheques: p.cheques,
    credito: p.credito,
    cobranzas: p.cobranzas,
    gastos: p.gastos,
    transferencias: p.transferencias,
    observaciones: "",
  };
}

function limpiarRenglones(v: unknown, conFactura: boolean): DatosPlanilla["credito"] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 200)
    .map((x) => {
      const r = (x ?? {}) as Record<string, unknown>;
      return {
        nombre: String(r.nombre ?? "").trim().slice(0, 120),
        factura: conFactura ? String(r.factura ?? "").trim().slice(0, 40) || null : null,
        monto: Math.round(Number(r.monto) || 0),
      };
    })
    .filter((r) => r.nombre || r.monto);
}

export function limpiarDatos(raw: unknown): DatosPlanilla {
  const o = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => Math.round(Number(v) || 0);
  return {
    apertura: num(o.apertura),
    contado: num(o.contado),
    conteo: limpiarConteo(o.conteo) ?? { billetes: {}, sencillo: 0, monedas: 0 },
    cheques: num(o.cheques),
    credito: limpiarRenglones(o.credito, true),
    cobranzas: limpiarRenglones(o.cobranzas, true),
    gastos: limpiarRenglones(o.gastos, false),
    transferencias: limpiarRenglones(o.transferencias, false),
    observaciones: String(o.observaciones ?? "").slice(0, 1000),
  };
}

const COLS_GUARDADA = `id, caja_id, fecha::text AS fecha, responsable, camion, numero_caja, estado, datos,
  enviada_at::text AS enviada_at, revisada_at::text AS revisada_at, revisada_por, updated_at::text AS updated_at`;

export async function planillaGuardada(
  pool: Pool,
  schemaRaw: string,
  empresaId: string,
  cajaId: string
): Promise<PlanillaGuardada | null> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  if (!(await hayPlanillas(pool, schema))) return null;
  const r = await pool.query<PlanillaGuardada>(
    `SELECT ${COLS_GUARDADA} FROM ${quoteSchemaTable(schema, "planillas_arqueo")}
      WHERE empresa_id = $1::uuid AND caja_id = $2::uuid`,
    [empresaId, cajaId]
  );
  return r.rows[0] ?? null;
}

/**
 * Guarda la planilla de una caja (la crea la primera vez). La puede tocar
 * quien abrió la caja o un administrador; una ya revisada solo el admin.
 */
export async function guardarPlanilla(
  pool: Pool,
  schemaRaw: string,
  empresaId: string,
  cajaId: string,
  d: { datos: DatosPlanilla; enviar: boolean; usuarioId: string | null; esAdmin: boolean }
): Promise<PlanillaGuardada> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  if (!(await hayPlanillas(pool, schema))) throw new PlanillaError("Falta correr el SQL 58 (planillas de arqueo).", 409);
  const sistema = await planillaArqueo(pool, schema, empresaId, cajaId);
  if (!sistema) throw new PlanillaError("La caja no existe.", 404);

  const colsC = await columnas(pool, schema, "cajas");
  const dueno = colsC.has("abierta_por") ? "abierta_por" : colsC.has("usuario_id") ? "usuario_id" : null;
  if (!d.esAdmin && dueno) {
    const q = await pool.query<{ d: string | null }>(
      `SELECT ${dueno}::text AS d FROM ${quoteSchemaTable(schema, "cajas")} WHERE id = $1::uuid`,
      [cajaId]
    );
    const duenoId = q.rows[0]?.d ?? null;
    if (duenoId && duenoId !== d.usuarioId) throw new PlanillaError("Esta caja es de otra persona.", 403);
  }
  const ya = await planillaGuardada(pool, schema, empresaId, cajaId);
  if (ya?.estado === "revisada" && !d.esAdmin) {
    throw new PlanillaError("El administrador ya revisó esta planilla: no se puede cambiar.", 409);
  }

  const efectivo = totalConteo(d.datos.conteo);
  const t = totalesPlanilla(d.datos, efectivo);
  const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date(sistema.caja.fecha_apertura));
  const estado: EstadoPlanilla = d.enviar ? "enviada" : (ya?.estado ?? "borrador");
  const { rows } = await pool.query<PlanillaGuardada>(
    `INSERT INTO ${quoteSchemaTable(schema, "planillas_arqueo")}
       (empresa_id, caja_id, fecha, usuario_id, responsable, camion, numero_caja, estado, datos,
        total_ventas, total_contado, total_credito, total_cobranzas, total_gastos, total_transferencias,
        efectivo, diferencia, enviada_at)
     VALUES ($1::uuid, $2::uuid, $3::date, $4::uuid, $5, $6, $7, $8, $9::jsonb,
             $10, $11, $12, $13, $14, $15, $16, $17, CASE WHEN $8 = 'enviada' THEN now() END)
     ON CONFLICT (empresa_id, caja_id) DO UPDATE SET
       datos = EXCLUDED.datos, estado = EXCLUDED.estado,
       responsable = COALESCE(planillas_arqueo.responsable, EXCLUDED.responsable),
       camion = COALESCE(planillas_arqueo.camion, EXCLUDED.camion),
       total_ventas = EXCLUDED.total_ventas, total_contado = EXCLUDED.total_contado,
       total_credito = EXCLUDED.total_credito, total_cobranzas = EXCLUDED.total_cobranzas,
       total_gastos = EXCLUDED.total_gastos, total_transferencias = EXCLUDED.total_transferencias,
       efectivo = EXCLUDED.efectivo, diferencia = EXCLUDED.diferencia,
       enviada_at = CASE WHEN EXCLUDED.estado = 'enviada' THEN now() ELSE planillas_arqueo.enviada_at END,
       updated_at = now()
     RETURNING ${COLS_GUARDADA}`,
    [
      empresaId, cajaId, fecha, d.usuarioId, sistema.responsable, sistema.camion, sistema.caja.numero_caja, estado,
      JSON.stringify(d.datos), t.ventas, d.datos.contado, t.credito, t.cobranzas, t.gastos, t.transferencias,
      efectivo + (Number(d.datos.cheques) || 0), t.diferencia,
    ]
  );
  return rows[0];
}

/** El administrador la da por revisada (o la vuelve a abrir). */
export async function marcarRevisada(
  pool: Pool,
  schemaRaw: string,
  empresaId: string,
  id: string,
  revisada: boolean,
  quien: string | null
) {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const r = await pool.query(
    `UPDATE ${quoteSchemaTable(schema, "planillas_arqueo")}
        SET estado = CASE WHEN $3 THEN 'revisada' ELSE 'enviada' END,
            revisada_at = CASE WHEN $3 THEN now() END,
            revisada_por = CASE WHEN $3 THEN $4 END,
            updated_at = now()
      WHERE id = $1::uuid AND empresa_id = $2::uuid`,
    [id, empresaId, revisada, quien]
  );
  if (!r.rowCount) throw new PlanillaError("La planilla no existe.", 404);
}

export async function listarPlanillas(
  pool: Pool,
  schemaRaw: string,
  empresaId: string,
  f: { desde: string; hasta: string }
): Promise<{ disponible: boolean; planillas: PlanillaResumen[] }> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  if (!(await hayPlanillas(pool, schema))) return { disponible: false, planillas: [] };
  const { rows } = await pool.query<PlanillaResumen>(
    `SELECT id, caja_id, fecha::text AS fecha, responsable, camion, numero_caja, estado,
            total_ventas::float AS total_ventas, total_contado::float AS total_contado,
            total_credito::float AS total_credito, total_cobranzas::float AS total_cobranzas,
            total_gastos::float AS total_gastos, total_transferencias::float AS total_transferencias,
            efectivo::float AS efectivo, diferencia::float AS diferencia,
            enviada_at::text AS enviada_at, updated_at::text AS updated_at
       FROM ${quoteSchemaTable(schema, "planillas_arqueo")}
      WHERE empresa_id = $1::uuid AND fecha BETWEEN $2::date AND $3::date
      ORDER BY fecha DESC, updated_at DESC
      LIMIT 500`,
    [empresaId, f.desde, f.hasta]
  );
  return { disponible: true, planillas: rows };
}
