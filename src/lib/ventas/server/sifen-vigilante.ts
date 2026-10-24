import "server-only";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import type { Pool } from "pg";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { correrPaso, estadoSifen, pasosPendientes } from "@/lib/ventas/server/sifen-pasos";

/**
 * La factura electrónica de la caja, terminada por detrás.
 *
 * La caja la manda a la SET al cobrar, pero la respuesta llega después y la
 * caja deja de preguntar en cuanto se toca «Nueva venta»: la factura quedaba
 * «enviada» hasta que alguien entraba a buscarla. Acá se retoman las facturas
 * de venta de los últimos días que no terminaron (falta un paso, falló el
 * envío o falta la respuesta) y, si la SET la rechaza o el envío sigue
 * fallando, se avisa en la campanita.
 */

const DIAS = 3;
/** La caja recién cobrada se está mandando sola: no pisarla. */
const GRACIA_MS = 90_000;
/** Un envío que falló se reintenta, pero no en cada vuelta. */
const REINTENTO_MS = 5 * 60_000;
/** Recién al tercer fallo seguido de envío se avisa: un corte de red suelto no es un problema. */
const FALLOS_PARA_AVISAR = 3;
const MAX_POR_VUELTA = 8;

// Mismo proceso para la caja y el vigilante: una factura no se manda dos veces a la vez.
const enCurso = new Set<string>();
const ultimoIntento = new Map<string, number>();
const fallos = new Map<string, number>();

export function tomarFactura(facturaId: string): boolean {
  if (enCurso.has(facturaId)) return false;
  enCurso.add(facturaId);
  return true;
}
export function soltarFactura(facturaId: string) {
  enCurso.delete(facturaId);
}

type Venta = { id: string; factura_id: string; numero_control: string | null; cliente_id: string | null };
export type ResultadoVigilancia = { revisadas: number; aprobadas: number; problemas: number };

export async function vigilarFacturasSifen(
  request: Request,
  supabase: AppSupabaseClient,
  empresaId: string,
  usuarioId: string | null
): Promise<ResultadoVigilancia> {
  const res: ResultadoVigilancia = { revisadas: 0, aprobadas: 0, problemas: 0 };

  const { data: cfg } = await supabase
    .from("empresa_sifen_config")
    .select("activo")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (!(cfg as { activo?: boolean } | null)?.activo) return res;

  const pool = getChatPostgresPool();
  if (!pool) return res;
  const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
  const { rows: ventas } = await pool.query<Venta & { estado_sifen: string | null; fecha_ms: number }>(
    `SELECT v.id, v.factura_id, v.numero_control, v.cliente_id, fe.estado_sifen,
            (extract(epoch FROM v.fecha) * 1000)::float AS fecha_ms
       FROM ${quoteSchemaTable(schema, "ventas")} v
       LEFT JOIN ${quoteSchemaTable(schema, "factura_electronica")} fe
         ON fe.factura_id = v.factura_id AND fe.empresa_id = v.empresa_id
      WHERE v.empresa_id = $1::uuid AND v.factura_id IS NOT NULL
        AND COALESCE(v.estado, '') <> 'anulada'
        AND v.fecha >= now() - make_interval(days => $2::int)
        AND (COALESCE(fe.estado_sifen, '') NOT IN ('aprobado', 'rechazado', 'cancelado', 'anulado')
             -- Rechazada con la caja mirando: igual se avisa en la campanita (una vez).
             OR (fe.estado_sifen = 'rechazado' AND NOT EXISTS (
                   SELECT 1 FROM ${quoteSchemaTable(schema, "usuario_notificaciones")} n
                    WHERE n.empresa_id = v.empresa_id AND n.tipo = 'sifen_problema'
                      AND n.metadata->>'factura_id' = v.factura_id::text)))
      ORDER BY v.fecha DESC
      LIMIT 100`,
    [empresaId, DIAS]
  );
  if (ventas.length === 0) return res;

  const ahora = Date.now();
  const pendientes = ventas.filter((v) => {
    const e = v.estado_sifen;
    const reciente = ahora - Number(v.fecha_ms) < GRACIA_MS;
    if (e !== "enviado" && reciente) return false;
    const ultimo = ultimoIntento.get(v.factura_id) ?? 0;
    // La respuesta se pregunta cada vuelta; un paso que falló, cada 5 minutos.
    const espera = e === "enviado" ? 0 : (fallos.get(v.factura_id) ?? 0) > 0 ? REINTENTO_MS : 0;
    return ahora - ultimo >= espera;
  });

  for (const v of pendientes.slice(0, MAX_POR_VUELTA)) {
    if (!tomarFactura(v.factura_id)) continue;
    res.revisadas += 1;
    ultimoIntento.set(v.factura_id, Date.now());
    try {
      const antes = await estadoSifen(supabase, empresaId, v.factura_id);
      let falla: string | null = null;
      if (antes.estado_sifen === "rechazado") {
        // Ya estaba rechazada: no hay nada que mandar, solo el aviso de abajo.
      } else if (antes.estado_sifen === "enviado") {
        // «Todavía procesando» no es una falla: se vuelve a preguntar en la próxima vuelta.
        await correrPaso(request, v.factura_id, "consulta-lote");
      } else {
        for (const paso of pasosPendientes(antes.estado_sifen)) {
          const r = await correrPaso(request, v.factura_id, paso);
          if (!r.ok) {
            falla = r.message;
            break;
          }
        }
      }
      const despues = await estadoSifen(supabase, empresaId, v.factura_id);
      if (despues.estado_sifen === "aprobado") {
        res.aprobadas += 1;
        fallos.delete(v.factura_id);
        await limpiarAvisos(pool, schema, empresaId, v.factura_id);
      } else if (despues.estado_sifen === "rechazado") {
        res.problemas += 1;
        await avisar(pool, schema, empresaId, usuarioId, v, "rechazado", despues.error ?? "La SET rechazó la factura.");
      } else if (falla) {
        const n = (fallos.get(v.factura_id) ?? 0) + 1;
        fallos.set(v.factura_id, n);
        if (n >= FALLOS_PARA_AVISAR) {
          res.problemas += 1;
          await avisar(pool, schema, empresaId, usuarioId, v, "error", falla);
        }
      } else {
        fallos.delete(v.factura_id);
      }
    } catch (e) {
      console.warn("[sifen-vigilante]", v.factura_id, e instanceof Error ? e.message : e);
    } finally {
      soltarFactura(v.factura_id);
    }
  }
  return res;
}

async function limpiarAvisos(pool: Pool, schema: string, empresaId: string, facturaId: string) {
  try {
    await pool.query(
      `DELETE FROM ${quoteSchemaTable(schema, "usuario_notificaciones")}
        WHERE empresa_id = $1::uuid AND tipo = 'sifen_problema' AND metadata->>'factura_id' = $2`,
      [empresaId, facturaId]
    );
  } catch {
    /* best-effort */
  }
}

/** Un aviso por factura y por problema, a los administradores y a quien vendió. */
async function avisar(
  pool: Pool,
  schema: string,
  empresaId: string,
  usuarioId: string | null,
  v: Venta,
  estado: "rechazado" | "error",
  motivo: string
) {
  try {
    const tN = quoteSchemaTable(schema, "usuario_notificaciones");
    const ya = await pool.query(
      `SELECT 1 FROM ${tN}
        WHERE empresa_id = $1::uuid AND tipo = 'sifen_problema'
          AND metadata->>'factura_id' = $2 AND metadata->>'estado' = $3 LIMIT 1`,
      [empresaId, v.factura_id, estado]
    );
    if (ya.rowCount) return;

    const catalog = createServiceRoleClient();
    const { data: usuarios } = await catalog.from("usuarios").select("id, rol").eq("empresa_id", empresaId);
    const destinos = new Set(
      ((usuarios ?? []) as { id: string; rol?: string | null }[])
        .filter((u) => {
          const rol = String(u.rol ?? "").trim();
          return rol === "super_admin" || esRolAdminEmpresaOGlobal(rol);
        })
        .map((u) => u.id)
    );
    if (usuarioId) destinos.add(usuarioId);
    if (destinos.size === 0) return;

    let cliente: string | null = null;
    if (v.cliente_id) {
      const c = await pool.query<{ c: Record<string, unknown> | null }>(
        `SELECT to_jsonb(c) AS c FROM ${quoteSchemaTable(schema, "clientes")} c WHERE c.id = $1::uuid`,
        [v.cliente_id]
      );
      const r = c.rows[0]?.c ?? {};
      const txt = (k: string) => (typeof r[k] === "string" && (r[k] as string).trim() ? (r[k] as string).trim() : null);
      cliente = txt("razon_social") ?? txt("nombre") ?? txt("empresa");
    }
    const titulo = estado === "rechazado" ? "La SET rechazó una factura" : "No se pudo mandar una factura a la SET";
    const cuerpo = [v.numero_control ? `Venta ${v.numero_control}` : null, cliente, motivo.slice(0, 300)]
      .filter(Boolean)
      .join(" · ");
    for (const id of destinos) {
      await pool.query(
        `INSERT INTO ${tN} (empresa_id, usuario_id, tipo, titulo, cuerpo, metadata)
         VALUES ($1::uuid, $2::uuid, 'sifen_problema', $3, $4, $5::jsonb)`,
        [empresaId, id, titulo, cuerpo, JSON.stringify({ factura_id: v.factura_id, venta_id: v.id, estado })]
      );
    }
  } catch (e) {
    console.warn("[sifen-vigilante] aviso", e instanceof Error ? e.message : e);
  }
}
