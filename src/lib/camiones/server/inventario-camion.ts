import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { precioSegunLista } from "@/lib/ventas/listas-precio";
import { listaDelCamion } from "./camion-del-usuario";
import { CamionError } from "./movimientos-camion";

/**
 * Inventario de un camión en un período (desde una fecha hasta ahora):
 * cuánto se le cargó, cuánto vendió, qué más se movió y cuánto le queda.
 *
 * Todo sale de `movimientos_inventario` con la ubicación del camión, y el
 * saldo es el stock vivo de `inventario_stock_ubicacion`. El saldo inicial se
 * despeja: saldo − (cargada − vendida + otros).
 *
 * Cómo se clasifica cada movimiento del camión:
 *  - ENTRADA (compra, carga del salón…)         → cargada
 *  - SALIDA anulación (compra anulada)           → resta de cargada
 *  - SALIDA venta                                → vendida
 *  - ENTRADA anulación (venta anulada)           → resta de vendida
 *  - SALIDA transferencia (pasado al salón), otras salidas y AJUSTE de conteo → otros
 */

export type FilaInventarioCamion = {
  producto_id: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  precio_venta: number;
  saldo_inicial: number;
  cargada: number;
  vendida: number;
  otros: number;
  saldo: number;
};

export type MovimientoCamion = {
  fecha: string;
  tipo: "carga_compra" | "carga_salon" | "a_salon" | "venta" | "anulacion" | "ajuste" | "otro";
  producto: string;
  codigo: string;
  cantidad: number;
  referencia: string | null;
  usuario: string | null;
};

type Mov = {
  producto_id: string;
  tipo: string;
  origen: string | null;
  cantidad: string;
  referencia: string | null;
};

/** El conteo guarda AJUSTE con la cantidad en positivo y el signo en la referencia: "(+2)" / "(-2)". */
function signoAjuste(ref: string | null): number {
  return /\(-/.test(ref ?? "") ? -1 : 1;
}

function clasificar(m: Mov): { campo: "cargada" | "vendida" | "otros"; delta: number } {
  const c = Number(m.cantidad);
  const tipo = (m.tipo ?? "").toUpperCase();
  const origen = (m.origen ?? "").toLowerCase();
  if (tipo === "AJUSTE") return { campo: "otros", delta: signoAjuste(m.referencia) * c };
  if (tipo === "ENTRADA") return origen === "anulacion" ? { campo: "vendida", delta: -c } : { campo: "cargada", delta: c };
  if (origen === "venta") return { campo: "vendida", delta: c };
  if (origen === "anulacion") return { campo: "cargada", delta: -c };
  return { campo: "otros", delta: -c };
}

export async function inventarioCamion(opts: {
  schema: string;
  empresaId: string;
  camionId: string;
  desde: string; // YYYY-MM-DD, hora de Paraguay
}): Promise<{ alias: string; lista: string; desde: string; items: FilaInventarioCamion[]; movimientos: MovimientoCamion[] }> {
  const schema = assertAllowedChatDataSchema(opts.schema);
  const pool = getChatPostgresPool();
  if (!pool) throw new CamionError("Pool no disponible.", 500);
  const { empresaId } = opts;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.desde)) throw new CamionError("Fecha inválida.");

  const cam = await pool.query<{ alias: string; ubicacion_id: string | null }>(
    `SELECT alias, ubicacion_id FROM ${quoteSchemaTable(schema, "camiones")}
      WHERE id = $1::uuid AND empresa_id = $2::uuid`,
    [opts.camionId, empresaId]
  );
  const camion = cam.rows[0];
  if (!camion) throw new CamionError("Ese camión no existe.", 404);
  if (!camion.ubicacion_id) throw new CamionError(`El camión ${camion.alias} no tiene ubicación de inventario.`, 409);
  const ubicacionId = camion.ubicacion_id;
  const lista = (await listaDelCamion({ schema, empresaId, ubicacionId }).catch(() => null)) ?? "minorista";

  const desdeTs = `(($3::date)::timestamp AT TIME ZONE 'America/Asuncion')`;
  const [movsQ, stockQ] = await Promise.all([
    pool.query<Mov & { fecha: string; producto_nombre: string | null; producto_sku: string | null; usuario_nombre: string | null }>(
      `SELECT m.producto_id::text, m.tipo, m.origen, m.cantidad::text, m.referencia,
              m.fecha::text AS fecha, m.producto_nombre, m.producto_sku::text AS producto_sku, m.usuario_nombre
         FROM ${quoteSchemaTable(schema, "movimientos_inventario")} m
        WHERE m.empresa_id = $1::uuid AND m.ubicacion_id = $2::uuid AND m.fecha >= ${desdeTs}
        ORDER BY m.fecha DESC`,
      [empresaId, ubicacionId, opts.desde]
    ),
    pool.query<{ producto_id: string; stock: string }>(
      `SELECT producto_id::text, stock_actual::text AS stock
         FROM ${quoteSchemaTable(schema, "inventario_stock_ubicacion")}
        WHERE empresa_id = $1::uuid AND ubicacion_id = $2::uuid AND stock_actual <> 0`,
      [empresaId, ubicacionId]
    ),
  ]);

  const acc = new Map<string, { cargada: number; vendida: number; otros: number }>();
  const ids = new Set<string>(stockQ.rows.map((r) => r.producto_id));
  for (const m of movsQ.rows) {
    ids.add(m.producto_id);
    const a = acc.get(m.producto_id) ?? { cargada: 0, vendida: 0, otros: 0 };
    const { campo, delta } = clasificar(m);
    a[campo] += delta;
    acc.set(m.producto_id, a);
  }

  const prodQ = ids.size
    ? await pool.query<{ id: string; sku: string | null; nombre: string; unidad_medida: string | null; precio_venta: string | null }>(
        `SELECT id::text, sku::text, nombre, unidad_medida, precio_venta::text
           FROM ${quoteSchemaTable(schema, "productos")}
          WHERE empresa_id = $1::uuid AND id = ANY($2::uuid[])`,
        [empresaId, [...ids]]
      )
    : { rows: [] };
  const stock = new Map(stockQ.rows.map((r) => [r.producto_id, Number(r.stock)]));
  const items: FilaInventarioCamion[] = prodQ.rows.map((p) => {
    const a = acc.get(p.id) ?? { cargada: 0, vendida: 0, otros: 0 };
    const saldo = stock.get(p.id) ?? 0;
    return {
      producto_id: p.id,
      codigo: p.sku ?? "",
      descripcion: p.nombre,
      unidad: p.unidad_medida ?? "u",
      precio_venta: precioSegunLista(Number(p.precio_venta ?? 0), lista),
      saldo_inicial: saldo - (a.cargada - a.vendida + a.otros),
      cargada: a.cargada,
      vendida: a.vendida,
      otros: a.otros,
      saldo,
    };
  });
  items.sort((x, y) => x.descripcion.localeCompare(y.descripcion, "es"));

  const movimientos: MovimientoCamion[] = movsQ.rows
    .filter((m) => (m.origen ?? "").toLowerCase() !== "venta")
    .map((m) => {
      const tipo = (m.tipo ?? "").toUpperCase();
      const origen = (m.origen ?? "").toLowerCase();
      const t: MovimientoCamion["tipo"] =
        tipo === "AJUSTE"
          ? "ajuste"
          : origen === "anulacion"
            ? "anulacion"
            : origen === "transferencia"
              ? tipo === "ENTRADA"
                ? "carga_salon"
                : "a_salon"
              : origen === "compra"
                ? "carga_compra"
                : "otro";
      const c = Number(m.cantidad);
      return {
        fecha: m.fecha,
        tipo: t,
        producto: m.producto_nombre ?? "",
        codigo: m.producto_sku ?? "",
        cantidad: tipo === "AJUSTE" ? signoAjuste(m.referencia) * c : tipo === "ENTRADA" ? c : -c,
        referencia: m.referencia,
        usuario: m.usuario_nombre,
      };
    });

  return { alias: camion.alias, lista, desde: opts.desde, items, movimientos };
}
