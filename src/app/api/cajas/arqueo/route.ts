import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

const TZ = "America/Asuncion";
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function num(v: string | number | null): number {
  if (v === null) return 0;
  return typeof v === "number" ? v : Number(v);
}

function etiquetaMedio(medio: string): string {
  if (medio === "efectivo") return "Efectivo";
  if (medio === "tarjeta") return "Tarjeta";
  if (medio === "transferencia") return "Transferencia";
  if (medio === "cheque") return "Cheque";
  if (medio === "otro") return "Otro";
  if (medio === "") return "Sin registrar";
  return medio.charAt(0).toUpperCase() + medio.slice(1);
}

/**
 * GET /api/cajas/arqueo?fecha=YYYY-MM-DD
 *
 * Arqueo de las cajas de un día: apertura, movimientos y cuánto debería haber
 * en efectivo.
 *
 * Va sobre `caja_movimientos` y no sobre `ventas` a propósito: en la caja
 * también entran y salen retiros, egresos y devoluciones. Sumando solo ventas,
 * el total no cuadra contra la plata que hay en el cajón.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const empresaId = ctx.auth.empresa_id;
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
    const pool = getChatPostgresPool();
    if (!pool) return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });

    const pedida = request.nextUrl.searchParams.get("fecha")?.trim() ?? "";
    if (pedida && !FECHA_RE.test(pedida)) {
      return NextResponse.json(errorResponse("Fecha inválida: se espera YYYY-MM-DD."), {
        status: 400,
      });
    }

    const existeQ = await queryWithRetry<{ cajas: string | null; movs: string | null }>(
      pool,
      `SELECT to_regclass($1)::text AS cajas, to_regclass($2)::text AS movs`,
      [`${schema}.cajas`, `${schema}.caja_movimientos`]
    );
    if (existeQ.rows[0]?.cajas === null || existeQ.rows[0]?.movs === null) {
      return NextResponse.json(successResponse({ arqueo: { disponible: false, cajas: [] } }));
    }

    const fechaQ = await queryWithRetry<{ fecha: string }>(
      pool,
      `SELECT COALESCE(NULLIF($1, '')::date, (now() AT TIME ZONE $2)::date)::text AS fecha`,
      [pedida, TZ]
    );
    const fecha = fechaQ.rows[0].fecha;

    const tC = quoteSchemaTable(schema, "cajas");
    const tM = quoteSchemaTable(schema, "caja_movimientos");

    // Alcance. Por defecto se mira UNA caja: la propia. Ver la lista de todas
    // las del día es otra cosa —la mira el dueño, no el que está vendiendo— y
    // se pide explícitamente.
    const todas = request.nextUrl.searchParams.get("alcance") === "todas";

    // ¿La tabla guarda quién abrió la caja? Si la guarda, un vendedor ve las
    // suyas y no las de los demás. Las abiertas automáticamente al cobrar antes
    // de que esto existiera no tienen dueño: se cuentan como propias, porque
    // esconderlas dejaría al vendedor sin ninguna caja a la vista.
    const colsQ = await queryWithRetry<{ columna: string }>(
      pool,
      `SELECT column_name AS columna FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'cajas'`,
      [schema]
    );
    const cols = new Set(colsQ.rows.map((r) => r.columna));
    const colDueno = cols.has("abierta_por")
      ? "abierta_por"
      : cols.has("usuario_id")
        ? "usuario_id"
        : null;

    const auth = await getUserAndEmpresa(request);
    const yo = auth?.usuarioCatalogId ?? null;
    const filtroDueno =
      !todas && colDueno && yo ? ` AND (${colDueno} = $4::uuid OR ${colDueno} IS NULL)` : "";
    const paramsCajas: unknown[] = [empresaId, TZ, fecha];
    if (filtroDueno) paramsCajas.push(yo);

    // Una caja abierta ayer y todavía sin cerrar sigue siendo la caja de hoy:
    // se incluye aunque su apertura sea de otro día.
    const cajasQ = await queryWithRetry<{
      id: string;
      numero_caja: number;
      estado: string;
      fecha_apertura: string;
      fecha_cierre: string | null;
      monto_apertura: string;
      monto_cierre_contado: string | null;
      monto_esperado_efectivo: string | null;
      diferencia: string | null;
    }>(
      pool,
      `SELECT id, numero_caja, estado,
              fecha_apertura::text AS fecha_apertura,
              fecha_cierre::text   AS fecha_cierre,
              monto_apertura::text AS monto_apertura,
              monto_cierre_contado::text    AS monto_cierre_contado,
              monto_esperado_efectivo::text AS monto_esperado_efectivo,
              diferencia::text              AS diferencia
         FROM ${tC}
        WHERE empresa_id = $1::uuid
          AND ( (fecha_apertura AT TIME ZONE $2)::date = $3::date
                OR (estado = 'abierta' AND (fecha_apertura AT TIME ZONE $2)::date <= $3::date) )
          ${filtroDueno}
        -- La abierta primero: es la que se está usando ahora.
        ORDER BY (estado = 'abierta') DESC, fecha_apertura DESC
        ${todas ? "" : "LIMIT 1"}`,
      paramsCajas
    );

    // Las ventas a crédito del día no entran al cajón, pero son parte de lo
    // vendido: sin esa fila, el vendedor que fió medio camión ve un arqueo que
    // no se parece a su jornada. Va aparte y nunca sumada al efectivo.
    let credito = { cantidad: 0, total: 0 };
    const hayVentas = await queryWithRetry<{ t: string | null }>(
      pool,
      `SELECT to_regclass($1)::text AS t`,
      [`${schema}.ventas`]
    );
    if (hayVentas.rows[0]?.t) {
      const credQ = await queryWithRetry<{ cantidad: string; total: string }>(
        pool,
        `SELECT count(*)::text AS cantidad, COALESCE(sum(total), 0)::text AS total
           FROM ${quoteSchemaTable(schema, "ventas")}
          WHERE empresa_id = $1::uuid
            AND tipo_venta = 'CREDITO'
            AND COALESCE(estado, '') <> 'anulada'
            AND (fecha AT TIME ZONE $2)::date = $3::date`,
        [empresaId, TZ, fecha]
      );
      credito = {
        cantidad: Number(credQ.rows[0]?.cantidad ?? 0),
        total: Number(credQ.rows[0]?.total ?? 0),
      };
    }

    if (cajasQ.rows.length === 0) {
      /*
       * Ninguna caja TUYA ese día no es lo mismo que ningún movimiento ese día.
       * Si hay cajas de otra persona, el arqueo en cero hace pensar que no se
       * cobró nada, cuando en realidad la plata está en la caja de otro. Se
       * cuenta y se avisa, para que se sepa dónde mirar.
       */
      let otras = 0;
      if (!todas) {
        const otrasQ = await queryWithRetry<{ n: string }>(
          pool,
          `SELECT count(*)::text AS n FROM ${tC}
            WHERE empresa_id = $1::uuid
              AND ( (fecha_apertura AT TIME ZONE $2)::date = $3::date
                    OR (estado = 'abierta' AND (fecha_apertura AT TIME ZONE $2)::date <= $3::date) )`,
          [empresaId, TZ, fecha]
        );
        otras = Number(otrasQ.rows[0]?.n ?? 0);
      }
      return NextResponse.json(
        successResponse({
          arqueo: {
            disponible: true,
            fecha,
            alcance: todas ? "todas" : "mia",
            credito,
            cajas: [],
            otras_cajas: otras,
          },
        })
      );
    }

    const ids = cajasQ.rows.map((c) => c.id);

    // Los anulados no cuentan: esa plata no entró ni salió.
    const movsQ = await queryWithRetry<{
      caja_id: string;
      tipo: string;
      medio: string;
      cantidad: string;
      total: string;
    }>(
      pool,
      `SELECT caja_id,
              tipo,
              lower(btrim(COALESCE(medio_pago, ''))) AS medio,
              count(*)::text                         AS cantidad,
              COALESCE(sum(monto), 0)::text          AS total
         FROM ${tM}
        WHERE empresa_id = $1::uuid
          AND caja_id = ANY($2::uuid[])
          AND anulado_at IS NULL
        GROUP BY caja_id, tipo, 3
        ORDER BY sum(monto) DESC NULLS LAST`,
      [empresaId, ids]
    );

    // Los movimientos que no vienen de una venta —un retiro para combustible, el
    // pago a un funcionario— son los que explican por qué el efectivo esperado
    // no es igual a lo cobrado. Van con su concepto: "salieron 400.000" sin
    // decir para qué no le sirve a nadie al cerrar.
    const manualesQ = await queryWithRetry<{
      caja_id: string;
      tipo: string;
      concepto: string | null;
      medio: string;
      monto: string;
      fecha: string | null;
    }>(
      pool,
      `SELECT caja_id, tipo, concepto,
              lower(btrim(COALESCE(medio_pago, ''))) AS medio,
              monto::text AS monto,
              created_at::text AS fecha
         FROM ${tM}
        WHERE empresa_id = $1::uuid
          AND caja_id = ANY($2::uuid[])
          AND anulado_at IS NULL
          AND venta_id IS NULL
        ORDER BY created_at DESC
        LIMIT 100`,
      [empresaId, ids]
    );
    const manualesPorCaja = new Map<string, typeof manualesQ.rows>();
    for (const row of manualesQ.rows) {
      const lista = manualesPorCaja.get(row.caja_id) ?? [];
      lista.push(row);
      manualesPorCaja.set(row.caja_id, lista);
    }

    const porCaja = new Map<string, typeof movsQ.rows>();
    for (const row of movsQ.rows) {
      const lista = porCaja.get(row.caja_id) ?? [];
      lista.push(row);
      porCaja.set(row.caja_id, lista);
    }

    const cajas = cajasQ.rows.map((c) => {
      const movs = porCaja.get(c.id) ?? [];
      const apertura = num(c.monto_apertura);

      const ingresos = movs.filter((m) => m.tipo === "ingreso");
      const salidas = movs.filter((m) => m.tipo === "egreso" || m.tipo === "retiro");
      const ajustes = movs.filter((m) => m.tipo === "ajuste");

      const sumar = (lista: typeof movs, soloEfectivo: boolean) =>
        lista
          .filter((m) => !soloEfectivo || m.medio === "efectivo")
          .reduce((acc, m) => acc + num(m.total), 0);

      // `monto` se guarda siempre positivo y el signo lo da `tipo`.
      const esperadoEfectivo =
        apertura + sumar(ingresos, true) - sumar(salidas, true) + sumar(ajustes, true);

      // Desglose de lo que entró, por medio. Es lo que se compara al cerrar.
      const porMedio = new Map<string, { cantidad: number; total: number }>();
      for (const m of ingresos) {
        const acc = porMedio.get(m.medio) ?? { cantidad: 0, total: 0 };
        acc.cantidad += num(m.cantidad);
        acc.total += num(m.total);
        porMedio.set(m.medio, acc);
      }

      const contado = c.monto_cierre_contado === null ? null : num(c.monto_cierre_contado);

      return {
        id: c.id,
        numero_caja: Number(c.numero_caja),
        estado: c.estado === "cerrada" ? ("cerrada" as const) : ("abierta" as const),
        fecha_apertura: c.fecha_apertura,
        fecha_cierre: c.fecha_cierre,
        monto_apertura: apertura,
        ingresos: {
          total: sumar(ingresos, false),
          por_medio: [...porMedio.entries()]
            .map(([medio, v]) => ({ medio, label: etiquetaMedio(medio), ...v }))
            .sort((a, b) => b.total - a.total),
        },
        salidas: { total: sumar(salidas, false), cantidad: salidas.length },
        movimientos_manuales: (manualesPorCaja.get(c.id) ?? []).map((m) => ({
          tipo: m.tipo,
          concepto: m.concepto ?? "Sin concepto",
          medio: m.medio,
          label: etiquetaMedio(m.medio),
          monto: num(m.monto),
          fecha: m.fecha,
        })),
        ajustes: { total: sumar(ajustes, false), cantidad: ajustes.length },
        efectivo: {
          esperado: esperadoEfectivo,
          contado,
          // La diferencia guardada manda: es la que se firmó al cerrar.
          diferencia:
            c.diferencia !== null
              ? num(c.diferencia)
              : contado === null
                ? null
                : contado - esperadoEfectivo,
        },
      };
    });

    return NextResponse.json(successResponse({ arqueo: { disponible: true, fecha, alcance: todas ? "todas" : "mia", credito, cajas } }));
  } catch (err) {
    console.error("[/api/cajas/arqueo GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo calcular el arqueo."), { status: 500 });
  }
}
