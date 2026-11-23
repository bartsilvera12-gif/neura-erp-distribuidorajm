import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { cerrarCajasVencidas } from "@/lib/cajas/server/cierre-automatico";

const TZ = "America/Asuncion";
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

const n = (v: string | number | null | undefined): number => (v === null || v === undefined ? 0 : Number(v));

type Grupo = {
  key: string;
  titulo: string;
  usuarios: Set<string>;
  cajas: string[];
};

/**
 * GET /api/cajas/panel?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *
 * Panel de cajas separado por Caja Salón, cada camión y Administración.
 * Es solo lectura: cada grupo suma únicamente lo de SUS cajas (caja_id), así
 * ningún importe se mezcla ni se cuenta dos veces. Las ventas salen de `ventas`,
 * lo cobrado de `caja_movimientos` (ingresos de venta) y las cobranzas de
 * deudas anteriores de `cobros_clientes`.
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
    const dPedido = sp.get("desde")?.trim() ?? "";
    const hPedido = sp.get("hasta")?.trim() ?? "";
    if ((dPedido && !FECHA_RE.test(dPedido)) || (hPedido && !FECHA_RE.test(hPedido))) {
      return NextResponse.json(errorResponse("Fecha inválida: se espera YYYY-MM-DD."), { status: 400 });
    }

    await cerrarCajasVencidas(pool, schema, empresaId);

    const fq = await queryWithRetry<{ desde: string; hasta: string }>(
      pool,
      `SELECT COALESCE(NULLIF($1,'')::date, (now() AT TIME ZONE $3)::date)::text AS desde,
              COALESCE(NULLIF($2,'')::date, NULLIF($1,'')::date, (now() AT TIME ZONE $3)::date)::text AS hasta`,
      [dPedido, hPedido, TZ]
    );
    const { desde, hasta } = fq.rows[0];

    const tC = quoteSchemaTable(schema, "cajas");
    const tM = quoteSchemaTable(schema, "caja_movimientos");
    const tV = quoteSchemaTable(schema, "ventas");

    // Cajas del período (más las abiertas de días anteriores, que siguen en uso).
    const cajasQ = await queryWithRetry<{
      id: string;
      numero_caja: number;
      abierta_por: string | null;
      estado: string;
      fecha_apertura: string;
      fecha_cierre: string | null;
      monto_apertura: string;
    }>(
      pool,
      `SELECT id, numero_caja, abierta_por::text AS abierta_por, estado,
              fecha_apertura::text AS fecha_apertura, fecha_cierre::text AS fecha_cierre,
              monto_apertura::text AS monto_apertura
         FROM ${tC}
        WHERE empresa_id = $1::uuid
          AND ( (fecha_apertura AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
                OR (estado = 'abierta' AND (fecha_apertura AT TIME ZONE $2)::date <= $4::date) )
        ORDER BY fecha_apertura`,
      [empresaId, TZ, desde, hasta]
    );

    // Dueños de cajas: a qué grupo pertenece cada uno.
    const usuariosQ = await queryWithRetry<{ id: string; nombre: string | null; rol: string | null; es_repartidor: boolean | null }>(
      pool,
      `SELECT id::text AS id, nombre, rol, es_repartidor
         FROM ${quoteSchemaTable(schema, "usuarios")} WHERE empresa_id = $1::uuid`,
      [empresaId]
    );
    const usuarios = new Map(usuariosQ.rows.map((u) => [u.id, u]));
    const camionesQ = await queryWithRetry<{ alias: string | null; repartidor_id: string | null }>(
      pool,
      `SELECT alias, repartidor_id::text AS repartidor_id
         FROM ${quoteSchemaTable(schema, "camiones")}
        WHERE empresa_id = $1::uuid AND COALESCE(activo, true) ORDER BY alias`,
      [empresaId]
    );

    const grupos = new Map<string, Grupo>();
    const salon: Grupo = { key: "salon", titulo: "Caja Salón", usuarios: new Set(), cajas: [] };
    grupos.set("salon", salon);
    for (const cm of camionesQ.rows) {
      if (!cm.repartidor_id) continue;
      const alias = (cm.alias ?? "").trim().replace(/\s*-\s*$/, "");
      const g: Grupo = {
        key: `camion:${cm.repartidor_id}`,
        titulo: /^cami[oó]n\b/i.test(alias) ? alias.replace(/^cami[oó]n/i, "Camión") : `Camión ${alias}`.trim(),
        usuarios: new Set([cm.repartidor_id]),
        cajas: [],
      };
      grupos.set(g.key, g);
    }
    const admin: Grupo = { key: "admin", titulo: "Administración", usuarios: new Set(), cajas: [] };
    for (const u of usuariosQ.rows) if (u.rol === "admin") admin.usuarios.add(u.id);
    const grupoDeUsuario = (uid: string | null): Grupo => {
      if (!uid) return salon;
      for (const g of grupos.values()) if (g.usuarios.has(uid)) return g;
      if (admin.usuarios.has(uid)) return admin;
      const u = usuarios.get(uid);
      if (u?.es_repartidor) {
        const g: Grupo = { key: `camion:${uid}`, titulo: `Camión – ${u.nombre ?? "repartidor"}`, usuarios: new Set([uid]), cajas: [] };
        grupos.set(g.key, g);
        return g;
      }
      return salon;
    };
    const grupoDeCaja = new Map<string, Grupo>();
    for (const c of cajasQ.rows) {
      const g = grupoDeUsuario(c.abierta_por);
      g.cajas.push(c.id);
      grupoDeCaja.set(c.id, g);
    }
    // Administración va al final: se agrega después de los camiones.
    grupos.set("admin", admin);

    const ids = cajasQ.rows.map((c) => c.id);

    type Acum = {
      ventas: { cantidad: number; total: number; contado: number; credito: number; efectivo: number; transferencia: number; cheque: number; otros: number };
      cobranzas: { efectivo: number; transferencia: number; cheque: number; otros: number; total: number };
      facturacion: { cantidad: number; total: number };
      productos: Map<string, { nombre: string; cantidad: number; monto: number }>;
      creditos: Map<string, { cliente: string; saldo: number; facturas: number }>;
    };
    const acum = new Map<string, Acum>();
    for (const g of grupos.values()) {
      acum.set(g.key, {
        ventas: { cantidad: 0, total: 0, contado: 0, credito: 0, efectivo: 0, transferencia: 0, cheque: 0, otros: 0 },
        cobranzas: { efectivo: 0, transferencia: 0, cheque: 0, otros: 0, total: 0 },
        facturacion: { cantidad: 0, total: 0 },
        productos: new Map(),
        creditos: new Map(),
      });
    }
    const medioKey = (m: string): "efectivo" | "transferencia" | "cheque" | "otros" =>
      m === "efectivo" ? "efectivo" : m === "transferencia" ? "transferencia" : m === "cheque" ? "cheque" : "otros";
    const acumDe = (cajaId: string): Acum => acum.get(grupoDeCaja.get(cajaId)!.key)!;

    if (ids.length > 0) {
      const vQ = await queryWithRetry<{ caja_id: string; cantidad: string; total: string; credito: string; fac_cant: string; fac_total: string }>(
        pool,
        `SELECT caja_id::text AS caja_id, count(*)::text AS cantidad,
                COALESCE(sum(total),0)::text AS total,
                COALESCE(sum(total) FILTER (WHERE tipo_venta = 'CREDITO'),0)::text AS credito,
                count(factura_id)::text AS fac_cant,
                COALESCE(sum(total) FILTER (WHERE factura_id IS NOT NULL),0)::text AS fac_total
           FROM ${tV}
          WHERE empresa_id = $1::uuid AND caja_id = ANY($2::uuid[])
            AND COALESCE(estado,'') <> 'anulada'
            AND (fecha AT TIME ZONE $3)::date BETWEEN $4::date AND $5::date
          GROUP BY caja_id`,
        [empresaId, ids, TZ, desde, hasta]
      );
      for (const r of vQ.rows) {
        const a = acumDe(r.caja_id);
        a.ventas.cantidad += n(r.cantidad);
        a.ventas.total += n(r.total);
        a.ventas.credito += n(r.credito);
        a.ventas.contado += n(r.total) - n(r.credito);
        a.facturacion.cantidad += n(r.fac_cant);
        a.facturacion.total += n(r.fac_total);
      }

      // Cobrado por las ventas del período, por medio (sin los cobros de deudas).
      const mQ = await queryWithRetry<{ caja_id: string; medio: string; total: string }>(
        pool,
        `SELECT m.caja_id::text AS caja_id, lower(btrim(COALESCE(m.medio_pago,''))) AS medio,
                COALESCE(sum(m.monto),0)::text AS total
           FROM ${tM} m
           JOIN ${tV} v ON v.id = m.venta_id
          WHERE m.empresa_id = $1::uuid AND m.caja_id = ANY($2::uuid[])
            AND m.tipo = 'ingreso' AND m.anulado_at IS NULL
            AND COALESCE(v.estado,'') <> 'anulada'
            AND v.tipo_venta IS DISTINCT FROM 'CREDITO'
            AND (v.fecha AT TIME ZONE $3)::date BETWEEN $4::date AND $5::date
            AND m.id NOT IN (SELECT caja_movimiento_id FROM ${quoteSchemaTable(schema, "cobros_clientes")} WHERE caja_movimiento_id IS NOT NULL)
          GROUP BY 1, 2`,
        [empresaId, ids, TZ, desde, hasta]
      );
      for (const r of mQ.rows) {
        acumDe(r.caja_id).ventas[medioKey(r.medio)] += n(r.total);
      }

      // Productos más vendidos (cantidad y monto).
      const pQ = await queryWithRetry<{ caja_id: string; producto: string; cantidad: string; monto: string }>(
        pool,
        `SELECT v.caja_id::text AS caja_id, vi.producto_nombre AS producto,
                COALESCE(sum(vi.cantidad),0)::text AS cantidad, COALESCE(sum(vi.total_linea),0)::text AS monto
           FROM ${quoteSchemaTable(schema, "ventas_items")} vi
           JOIN ${tV} v ON v.id = vi.venta_id
          WHERE v.empresa_id = $1::uuid AND v.caja_id = ANY($2::uuid[])
            AND COALESCE(v.estado,'') <> 'anulada'
            AND (v.fecha AT TIME ZONE $3)::date BETWEEN $4::date AND $5::date
          GROUP BY 1, 2`,
        [empresaId, ids, TZ, desde, hasta]
      );
      for (const r of pQ.rows) {
        const a = acumDe(r.caja_id);
        const p = a.productos.get(r.producto) ?? { nombre: r.producto, cantidad: 0, monto: 0 };
        p.cantidad += n(r.cantidad);
        p.monto += n(r.monto);
        a.productos.set(r.producto, p);
      }
    }

    // Cobranzas de deudas (cuentas por cobrar) hechas en el período.
    // Salen de caja_movimientos (ingresos de ventas a crédito, por el día en que
    // se cobraron) y van a la caja donde se registró el cobro. Es lo mismo que
    // muestra la planilla de cada caja.
    const cobQ = await queryWithRetry<{ caja_id: string | null; medio: string; total: string }>(
      pool,
      `SELECT m.caja_id::text AS caja_id,
              lower(btrim(COALESCE(m.medio_pago,''))) AS medio, COALESCE(sum(m.monto),0)::text AS total
         FROM ${tM} m
         JOIN ${tV} v ON v.id = m.venta_id
        WHERE m.empresa_id = $1::uuid AND m.tipo = 'ingreso' AND m.anulado_at IS NULL
          AND v.tipo_venta = 'CREDITO' AND COALESCE(v.estado,'') <> 'anulada'
          AND (m.created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
        GROUP BY 1, 2`,
      [empresaId, TZ, desde, hasta]
    );
    for (const r of cobQ.rows) {
      const g = r.caja_id ? grupoDeCaja.get(r.caja_id) : undefined;
      if (!g) continue;
      const a = acum.get(g.key)!;
      a.cobranzas[medioKey(r.medio)] += n(r.total);
      a.cobranzas.total += n(r.total);
    }

    // Créditos pendientes de las ventas de cada grupo (a hoy, sin límite de fecha).
    const crQ = await queryWithRetry<{ abierta_por: string | null; cliente: string; saldo: string; facturas: string }>(
      pool,
      `SELECT c.abierta_por::text AS abierta_por, COALESCE(NULLIF(btrim(cl.nombre),''), 'Sin cliente') AS cliente,
              sum(cpc.saldo)::text AS saldo, count(*)::text AS facturas
         FROM ${quoteSchemaTable(schema, "cuentas_por_cobrar")} cpc
         JOIN ${tV} v ON v.id = cpc.venta_id
         JOIN ${tC} c ON c.id = v.caja_id
         LEFT JOIN ${quoteSchemaTable(schema, "clientes")} cl ON cl.id = cpc.cliente_id
        WHERE cpc.empresa_id = $1::uuid AND cpc.saldo > 0 AND COALESCE(v.estado,'') <> 'anulada'
        GROUP BY 1, 2`,
      [empresaId]
    );
    for (const r of crQ.rows) {
      const a = acum.get(grupoDeUsuario(r.abierta_por).key)!;
      const c = a.creditos.get(r.cliente) ?? { cliente: r.cliente, saldo: 0, facturas: 0 };
      c.saldo += n(r.saldo);
      c.facturas += n(r.facturas);
      a.creditos.set(r.cliente, c);
    }

    const respuesta = [...grupos.values()].map((g) => {
      const a = acum.get(g.key)!;
      const suyas = cajasQ.rows.filter((c) => grupoDeCaja.get(c.id) === g);
      const abierta = suyas.find((c) => c.estado === "abierta");
      return {
        key: g.key,
        titulo: g.titulo,
        online: !!abierta,
        apertura: {
          monto: suyas.reduce((s, c) => s + n(c.monto_apertura), 0),
          hora: suyas[0]?.fecha_apertura ?? null,
        },
        cajas: suyas.map((c) => ({
          id: c.id,
          numero_caja: Number(c.numero_caja),
          estado: c.estado === "cerrada" ? "cerrada" : "abierta",
          fecha_apertura: c.fecha_apertura,
          fecha_cierre: c.fecha_cierre,
          monto_apertura: n(c.monto_apertura),
        })),
        ventas: a.ventas,
        cobranzas: a.cobranzas,
        facturacion: a.facturacion,
        productos: [...a.productos.values()].sort((x, y) => y.monto - x.monto).slice(0, 10),
        creditos: {
          total: [...a.creditos.values()].reduce((s, c) => s + c.saldo, 0),
          clientes: [...a.creditos.values()].sort((x, y) => y.saldo - x.saldo).slice(0, 15),
        },
      };
    });

    return NextResponse.json(successResponse({ panel: { desde, hasta, grupos: respuesta } }));
  } catch (err) {
    console.error("[/api/cajas/panel GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo calcular el panel de cajas."), { status: 500 });
  }
}
