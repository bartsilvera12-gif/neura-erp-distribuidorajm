import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { usuarioDelSchema } from "@/lib/repartos/server/repartos-pg";
import { alcanceRepartos } from "@/lib/usuarios/erp-rol-normalize";

/** Zona del negocio: el día del cierre es el día calendario en Paraguay. */
const TZ = "America/Asuncion";
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function num(v: string | number | null): number {
  if (v === null) return 0;
  return typeof v === "number" ? v : Number(v);
}

/** `metodo_pago` es texto libre; agrupamos las variantes conocidas. */
function etiquetaMetodo(clave: string): string {
  if (clave === "efectivo") return "Efectivo";
  if (clave === "transferencia") return "Transferencia";
  if (clave === "cheque") return "Cheque";
  if (clave === "tarjeta") return "Tarjeta";
  if (clave === "") return "Sin registrar";
  return clave.charAt(0).toUpperCase() + clave.slice(1);
}

/**
 * GET /api/ventas/cierre?fecha=YYYY-MM-DD | ?reparto=<uuid>
 *
 * Cierre del día: lo vendido (facturado, contado, crédito, anulado) y lo
 * cobrado por método. Son dos cosas distintas —una venta a crédito factura hoy
 * y se cobra otro día—, así que van separadas y no se suman.
 *
 * Con `reparto` el cierre se acota a la jornada de ese camión y agrega el
 * control de mercadería. Las cobranzas pasan a leerse de los movimientos de
 * caja de las ventas del reparto: es lo único que ata plata cobrada con camión.
 * Un cobro de cuenta corriente que el repartidor haga en la calle no queda
 * incluido, porque nada lo liga al reparto.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

    const repartoId = request.nextUrl.searchParams.get("reparto")?.trim() ?? "";
    if (repartoId && !UUID_RE.test(repartoId)) {
      return NextResponse.json(errorResponse("Reparto inválido."), { status: 400 });
    }

    const pedida = request.nextUrl.searchParams.get("fecha")?.trim() ?? "";
    if (pedida && !FECHA_RE.test(pedida)) {
      return NextResponse.json(errorResponse("Fecha inválida: se espera YYYY-MM-DD."), {
        status: 400,
      });
    }

    // Datos del reparto: además de identificarlo, su fecha manda sobre la
    // pedida — el cierre de un reparto es el de SU jornada.
    let reparto: {
      id: string;
      camion: string;
      repartidor: string | null;
      estado: string;
      ubicacion_id: string | null;
      fecha: string;
    } | null = null;

    if (repartoId) {
      const tR = quoteSchemaTable(schema, "repartos");
      const tC = quoteSchemaTable(schema, "camiones");
      const tU = quoteSchemaTable(schema, "usuarios");
      const repQ = await queryWithRetry<{
        id: string;
        camion: string;
        repartidor: string | null;
        estado: string;
        ubicacion_id: string | null;
        fecha: string;
      }>(
        pool,
        `SELECT r.id, c.alias AS camion, COALESCE(u.nombre, u.email) AS repartidor,
                r.estado, c.ubicacion_id, r.fecha::text AS fecha
           FROM ${tR} r
           JOIN ${tC} c ON c.id = r.camion_id
           LEFT JOIN ${tU} u ON u.id = r.repartidor_id
          WHERE r.id = $1::uuid AND r.empresa_id = $2::uuid`,
        [repartoId, empresaId]
      );
      if (repQ.rows.length === 0) {
        return NextResponse.json(errorResponse("Reparto no encontrado."), { status: 404 });
      }

      // El vendedor móvil no puede leer el cierre de otro camión: ahí están las
      // ventas y la plata de un compañero.
      const yo = await usuarioDelSchema({ schema, empresaId, email: ctx.auth.user.email });
      if (alcanceRepartos(yo?.rol) === "propios") {
        const tR2 = quoteSchemaTable(schema, "repartos");
        const propio = await queryWithRetry<{ ok: number }>(
          pool,
          `SELECT 1 AS ok FROM ${tR2}
            WHERE id = $1::uuid AND empresa_id = $2::uuid AND repartidor_id = $3::uuid`,
          [repartoId, empresaId, yo?.id ?? null]
        );
        if (propio.rows.length === 0) {
          return NextResponse.json(errorResponse("Ese reparto no es tuyo."), { status: 403 });
        }
      }

      reparto = repQ.rows[0];
    }

    const fechaQ = await queryWithRetry<{ fecha: string }>(
      pool,
      `SELECT COALESCE(NULLIF($1, '')::date, (now() AT TIME ZONE $2)::date)::text AS fecha`,
      [reparto?.fecha ?? pedida, TZ]
    );
    const fecha = fechaQ.rows[0].fecha;

    // ── Ventas del día ──────────────────────────────────────────────────────
    const tV = quoteSchemaTable(schema, "ventas");
    const ventasQ = await queryWithRetry<{
      anulada: boolean;
      tipo_venta: string;
      cantidad: string;
      total: string;
    }>(
      pool,
      `SELECT (COALESCE(estado, '') = 'anulada') AS anulada,
              tipo_venta,
              count(*)::text                AS cantidad,
              COALESCE(sum(total), 0)::text AS total
         FROM ${tV}
        WHERE empresa_id = $1::uuid
          ${reparto ? "AND reparto_id = $4::uuid" : "AND (fecha AT TIME ZONE $2)::date = $3::date"}
        GROUP BY 1, 2`,
      reparto ? [empresaId, TZ, fecha, reparto.id] : [empresaId, TZ, fecha]
    );

    const ventas = {
      facturado: 0,
      contado: 0,
      credito: 0,
      cantidad: 0,
      anuladas: { cantidad: 0, total: 0 },
    };
    for (const row of ventasQ.rows) {
      const cantidad = num(row.cantidad);
      const total = num(row.total);
      if (row.anulada) {
        // Las anuladas se informan aparte y NO entran en lo facturado: si se
        // sumaran, el cierre cuadraría contra plata que nunca entró.
        ventas.anuladas.cantidad += cantidad;
        ventas.anuladas.total += total;
        continue;
      }
      ventas.facturado += total;
      ventas.cantidad += cantidad;
      if (row.tipo_venta === "CREDITO") ventas.credito += total;
      else ventas.contado += total;
    }

    // ── Cobranzas del día ───────────────────────────────────────────────────
    // `pagos` puede no existir en todos los schemas: sin la tabla el cierre
    // sigue mostrando las ventas en vez de romperse entero.
    const tablaPagosQ = await queryWithRetry<{ existe: string | null }>(
      pool,
      `SELECT to_regclass($1)::text AS existe`,
      [`${schema}.pagos`]
    );
    const hayPagos = tablaPagosQ.rows[0]?.existe !== null;

    let cobranzas: {
      disponible: boolean;
      lineas: { metodo: string; label: string; cantidad: number; total: number }[];
      total: number;
      cantidad: number;
    } = { disponible: false, lineas: [], total: 0, cantidad: 0 };

    // Con reparto, lo cobrado sale de los movimientos de caja de SUS ventas:
    // `pagos` no sabe de qué camión vino la plata.
    if (reparto) {
      const tM = quoteSchemaTable(schema, "caja_movimientos");
      const tV2 = quoteSchemaTable(schema, "ventas");
      const existeMovQ = await queryWithRetry<{ existe: string | null }>(
        pool,
        `SELECT to_regclass($1)::text AS existe`,
        [`${schema}.caja_movimientos`]
      );
      if (existeMovQ.rows[0]?.existe !== null) {
        const movQ = await queryWithRetry<{ metodo: string; cantidad: string; total: string }>(
          pool,
          `SELECT lower(btrim(COALESCE(m.medio_pago, ''))) AS metodo,
                  count(*)::text                          AS cantidad,
                  COALESCE(sum(m.monto), 0)::text         AS total
             FROM ${tM} m
             JOIN ${tV2} v ON v.id = m.venta_id
            WHERE m.empresa_id = $1::uuid
              AND v.reparto_id = $2::uuid
              AND m.tipo = 'ingreso'
              AND m.anulado_at IS NULL
            GROUP BY 1
            ORDER BY sum(m.monto) DESC NULLS LAST`,
          [empresaId, reparto.id]
        );
        const lineas = movQ.rows.map((r) => ({
          metodo: r.metodo,
          label: etiquetaMetodo(r.metodo),
          cantidad: num(r.cantidad),
          total: num(r.total),
        }));
        cobranzas = {
          disponible: true,
          lineas,
          total: lineas.reduce((acc, l) => acc + l.total, 0),
          cantidad: lineas.reduce((acc, l) => acc + l.cantidad, 0),
        };
      }
    } else if (hayPagos) {
      const tP = quoteSchemaTable(schema, "pagos");
      const pagosQ = await queryWithRetry<{
        metodo: string;
        cantidad: string;
        total: string;
      }>(
        pool,
        `SELECT lower(btrim(COALESCE(metodo_pago, ''))) AS metodo,
                count(*)::text                          AS cantidad,
                COALESCE(sum(monto), 0)::text           AS total
           FROM ${tP}
          WHERE empresa_id = $1::uuid
            AND (fecha_pago AT TIME ZONE $2)::date = $3::date
          GROUP BY 1
          -- Por el importe real: ordenar por la columna 3 ordenaría el ::text
          -- y 500000 quedaría antes que 3200000.
          ORDER BY sum(monto) DESC NULLS LAST`,
        [empresaId, TZ, fecha]
      );

      const lineas = pagosQ.rows.map((r) => ({
        metodo: r.metodo,
        label: etiquetaMetodo(r.metodo),
        cantidad: num(r.cantidad),
        total: num(r.total),
      }));

      cobranzas = {
        disponible: true,
        lineas,
        total: lineas.reduce((acc, l) => acc + l.total, 0),
        cantidad: lineas.reduce((acc, l) => acc + l.cantidad, 0),
      };
    }

    // ── Control de mercadería del reparto ───────────────────────────────────
    // Los totales se agrupan por unidad y no se suman entre sí: kilos y
    // unidades no se pueden sumar, y un total mezclado sería un número sin
    // sentido. Cuando todo el camión va en kg queda una sola línea, que es el
    // caso normal de la distribuidora.
    let mercaderia: {
      disponible: boolean;
      contado: boolean;
      lineas: {
        unidad: string;
        inicial: number;
        vendido: number;
        devuelto: number;
        regresa: number;
        diferencia: number;
      }[];
    } = { disponible: false, contado: false, lineas: [] };

    if (reparto && reparto.ubicacion_id) {
      const tS = quoteSchemaTable(schema, "reparto_stock");
      const tP2 = quoteSchemaTable(schema, "productos");
      const tSU = quoteSchemaTable(schema, "inventario_stock_ubicacion");
      const tV3 = quoteSchemaTable(schema, "ventas");
      const tVI = quoteSchemaTable(schema, "ventas_items");

      const mercQ = await queryWithRetry<{
        unidad: string;
        inicial: string;
        vendido: string;
        devuelto: string;
        teorico: string;
        contado: string | null;
      }>(
        pool,
        `SELECT COALESCE(NULLIF(rs.unidad_medida, ''), p.unidad_medida, '') AS unidad,
                COALESCE(sum(rs.cantidad_inicial), 0)::text  AS inicial,
                COALESCE(sum(rs.cantidad_devuelta), 0)::text AS devuelto,
                COALESCE(sum(COALESCE(su.stock_actual, 0)), 0)::text AS teorico,
                CASE WHEN count(rs.cantidad_contada) = 0 THEN NULL
                     ELSE COALESCE(sum(rs.cantidad_contada), 0)::text END AS contado,
                COALESCE(sum((
                  SELECT COALESCE(sum(vi.cantidad), 0)
                    FROM ${tVI} vi
                    JOIN ${tV3} v ON v.id = vi.venta_id
                   WHERE v.reparto_id = rs.reparto_id
                     AND vi.producto_id = rs.producto_id
                     AND COALESCE(v.estado, '') <> 'anulada'
                )), 0)::text AS vendido
           FROM ${tS} rs
           JOIN ${tP2} p ON p.id = rs.producto_id
           LEFT JOIN ${tSU} su
                  ON su.producto_id = rs.producto_id AND su.ubicacion_id = $2::uuid
          WHERE rs.reparto_id = $1::uuid
          GROUP BY 1
          ORDER BY 1`,
        [reparto.id, reparto.ubicacion_id]
      );

      const lineas = mercQ.rows.map((r) => {
        const teorico = num(r.teorico);
        const contado = r.contado === null ? null : num(r.contado);
        // Cerrado, lo que regresa es lo que se contó; abierto, lo que debería.
        const regresa = contado ?? teorico;
        return {
          unidad: r.unidad,
          inicial: num(r.inicial),
          vendido: num(r.vendido),
          devuelto: num(r.devuelto),
          regresa,
          diferencia: contado === null ? 0 : contado - teorico,
        };
      });

      mercaderia = {
        disponible: lineas.length > 0,
        contado: mercQ.rows.some((r) => r.contado !== null),
        lineas,
      };
    }

    return NextResponse.json(
      successResponse({
        cierre: {
          fecha,
          reparto: reparto
            ? {
                id: reparto.id,
                camion: reparto.camion,
                repartidor: reparto.repartidor,
                estado: reparto.estado === "cerrado" ? "cerrado" : "abierto",
              }
            : null,
          ventas,
          cobranzas,
          mercaderia,
        },
      })
    );
  } catch (err) {
    console.error("[/api/ventas/cierre GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo calcular el cierre."), { status: 500 });
  }
}
