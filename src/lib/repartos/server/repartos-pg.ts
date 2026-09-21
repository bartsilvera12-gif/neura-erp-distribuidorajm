import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import type { Camion, ItemReparto, Reparto, Ubicacion } from "@/lib/repartos/types";

/**
 * Consultas de repartos sobre las tablas del schema: `repartos`, `camiones`,
 * `reparto_stock`, más el stock por ubicación.
 *
 * El teórico —lo que debería estar arriba del camión— NO se calcula sumando y
 * restando columnas de `reparto_stock`: es el saldo de la ubicación del camión
 * en `inventario_stock_ubicacion`. Calcularlo daría mal en cuanto hubiera una
 * carga de proveedor o una transferencia al salón en el medio de la jornada; el
 * saldo de la ubicación ya las tiene todas.
 *
 * El vendido sí se lee desde `ventas`, y no desde el acumulado
 * `reparto_stock.cantidad_vendida`: si algo cargó una venta sin actualizarlo, el
 * acumulado miente y las ventas no.
 */

function num(v: string | number | null): number {
  if (v === null) return 0;
  return typeof v === "number" ? v : Number(v);
}

/** `true` si el schema tiene el dominio de repartos. */
export async function hayTablasReparto(schema: string): Promise<boolean> {
  const pool = getChatPostgresPool();
  if (!pool) return false;
  const q = await queryWithRetry<{ repartos: string | null; stock: string | null }>(
    pool,
    `SELECT to_regclass($1)::text AS repartos, to_regclass($2)::text AS stock`,
    [`${schema}.repartos`, `${schema}.reparto_stock`]
  );
  const row = q.rows[0];
  return Boolean(row?.repartos) && Boolean(row?.stock);
}

type FilaReparto = {
  id: string;
  camion_id: string;
  camion: string;
  ubicacion_id: string | null;
  repartidor_id: string;
  repartidor: string | null;
  estado: string;
  fecha: string;
  abierto_at: string;
  cerrado_at: string | null;
  merma_kg: string | null;
  notas_cierre: string | null;
};

type FilaItem = {
  reparto_id: string;
  producto_id: string;
  nombre: string;
  unidad: string;
  cargado: string;
  devuelto: string;
  vendido: string;
  teorico: string;
  contado: string | null;
  motivo: string | null;
};

export async function listarRepartos(opts: {
  schema: string;
  empresaId: string;
  fecha?: string;
  soloAbiertos?: boolean;
  /** Acota a los repartos de un repartidor: el alcance del vendedor móvil. */
  soloDe?: string | null;
}): Promise<Reparto[]> {
  const pool = getChatPostgresPool();
  if (!pool) return [];

  const tR = quoteSchemaTable(opts.schema, "repartos");
  const tC = quoteSchemaTable(opts.schema, "camiones");
  const tU = quoteSchemaTable(opts.schema, "usuarios");
  const tS = quoteSchemaTable(opts.schema, "reparto_stock");
  const tP = quoteSchemaTable(opts.schema, "productos");
  const tV = quoteSchemaTable(opts.schema, "ventas");
  const tVI = quoteSchemaTable(opts.schema, "ventas_items");
  const tSU = quoteSchemaTable(opts.schema, "inventario_stock_ubicacion");

  const condiciones = ["r.empresa_id = $1::uuid"];
  const params: unknown[] = [opts.empresaId];
  if (opts.soloAbiertos) {
    condiciones.push("r.estado = 'abierto'");
  } else if (opts.fecha) {
    params.push(opts.fecha);
    condiciones.push(`r.fecha = $${params.length}::date`);
  }
  if (opts.soloDe) {
    params.push(opts.soloDe);
    condiciones.push(`r.repartidor_id = $${params.length}::uuid`);
  }

  const repartosQ = await queryWithRetry<FilaReparto>(
    pool,
    `SELECT r.id, r.camion_id, c.alias AS camion, c.ubicacion_id,
            r.repartidor_id,
            COALESCE(u.nombre, u.email) AS repartidor,
            r.estado, r.fecha::text AS fecha,
            r.abierto_at::text AS abierto_at, r.cerrado_at::text AS cerrado_at,
            r.merma_kg::text AS merma_kg, r.notas_cierre
       FROM ${tR} r
       JOIN ${tC} c ON c.id = r.camion_id
       LEFT JOIN ${tU} u ON u.id = r.repartidor_id
      WHERE ${condiciones.join(" AND ")}
      ORDER BY r.abierto_at DESC`,
    params
  );
  if (repartosQ.rows.length === 0) return [];

  const ids = repartosQ.rows.map((r) => r.id);

  // Las filas en cero no se muestran.
  //
  // Una carga y una descarga escriben la misma fila de `reparto_stock`: bajar
  // todo lo que se había subido la deja en 0 en vez de borrarla. Esa fila
  // después aparecía en el control de mercadería como un producto más —"salió
  // 0, vendió 0, debería haber 0"— y encima pedía contarlo para poder cerrar.
  //
  // Se filtra al leer y no al escribir para que arregle también los repartos
  // que ya tienen la fila. Alcanza con que *algo* haya pasado: si se vendió,
  // si quedó algo arriba o si ya se contó, la fila queda aunque el resto dé 0.
  const itemsQ = await queryWithRetry<FilaItem>(
    pool,
    `SELECT * FROM (
       SELECT rs.reparto_id,
              rs.producto_id,
              p.nombre,
              COALESCE(NULLIF(rs.unidad_medida, ''), p.unidad_medida, '') AS unidad,
              rs.cantidad_inicial::text  AS cargado,
              rs.cantidad_devuelta::text AS devuelto,
              rs.cantidad_contada::text  AS contado,
              rs.motivo_diferencia       AS motivo,
              COALESCE(su.stock_actual, 0)::text AS teorico,
              COALESCE((
                SELECT sum(vi.cantidad)
                  FROM ${tVI} vi
                  JOIN ${tV} v ON v.id = vi.venta_id
                 WHERE v.reparto_id = rs.reparto_id
                   AND vi.producto_id = rs.producto_id
                   AND COALESCE(v.estado, '') <> 'anulada'
              ), 0)::text AS vendido
         FROM ${tS} rs
         JOIN ${tP} p ON p.id = rs.producto_id
         JOIN ${tR} r ON r.id = rs.reparto_id
         JOIN ${tC} c ON c.id = r.camion_id
         LEFT JOIN ${tSU} su
                ON su.producto_id = rs.producto_id
               AND su.ubicacion_id = c.ubicacion_id
        WHERE rs.reparto_id = ANY($1::uuid[])
     ) f
      WHERE f.contado IS NOT NULL
         OR COALESCE(f.cargado::numeric, 0)  > 0
         OR COALESCE(f.vendido::numeric, 0)  > 0
         OR COALESCE(f.devuelto::numeric, 0) > 0
         OR COALESCE(f.teorico::numeric, 0)  > 0
      ORDER BY f.nombre`,
    [ids]
  );

  const porReparto = new Map<string, ItemReparto[]>();
  for (const row of itemsQ.rows) {
    const teorico = num(row.teorico);
    const contado = row.contado === null ? null : num(row.contado);
    const lista = porReparto.get(row.reparto_id) ?? [];
    lista.push({
      producto_id: row.producto_id,
      nombre: row.nombre,
      unidad: row.unidad,
      cargado: num(row.cargado),
      vendido: num(row.vendido),
      devuelto: num(row.devuelto),
      teorico,
      contado,
      diferencia: contado === null ? null : contado - teorico,
      motivo: row.motivo,
    });
    porReparto.set(row.reparto_id, lista);
  }

  return repartosQ.rows.map((r) => ({
    id: r.id,
    camion_id: r.camion_id,
    camion: r.camion,
    ubicacion_id: r.ubicacion_id,
    repartidor_id: r.repartidor_id,
    repartidor: r.repartidor,
    estado: r.estado === "cerrado" ? ("cerrado" as const) : ("abierto" as const),
    fecha: r.fecha,
    abierto_at: r.abierto_at,
    cerrado_at: r.cerrado_at,
    merma_kg: r.merma_kg === null ? null : num(r.merma_kg),
    notas_cierre: r.notas_cierre,
    items: porReparto.get(r.id) ?? [],
  }));
}

/**
 * Camiones de la empresa. Por defecto solo los activos, que es lo que hace
 * falta para abrir un reparto; con `incluirInactivos` vienen también los de
 * baja, para poder verlos y reactivarlos.
 */
export async function listarCamiones(opts: {
  schema: string;
  empresaId: string;
  incluirInactivos?: boolean;
}): Promise<Camion[]> {
  const pool = getChatPostgresPool();
  if (!pool) return [];

  const tC = quoteSchemaTable(opts.schema, "camiones");

  // `repartidor_id` la agrega la migración 13. Mientras no esté, los camiones
  // se listan igual sin dueño: la pantalla funciona, solo que no puede asignar.
  const colsQ = await queryWithRetry<{ columna: string }>(
    pool,
    `SELECT column_name AS columna FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'camiones' AND column_name = 'repartidor_id'`,
    [opts.schema]
  );
  const hayDueno = colsQ.rows.length > 0;
  const tU = quoteSchemaTable(opts.schema, "usuarios");

  const q = await queryWithRetry<Camion>(
    pool,
    `SELECT c.id, c.alias, c.patente, c.activo, c.ubicacion_id
            ${hayDueno ? ", c.repartidor_id, COALESCE(u.nombre, u.email) AS repartidor" : ", NULL::uuid AS repartidor_id, NULL::text AS repartidor"}
       FROM ${tC} c
       ${hayDueno ? `LEFT JOIN ${tU} u ON u.id = c.repartidor_id` : ""}
      WHERE c.empresa_id = $1::uuid
        ${opts.incluirInactivos ? "" : "AND c.activo = true"}
      ORDER BY c.activo DESC, c.alias`,
    [opts.empresaId]
  );
  return q.rows;
}

/** Ubicaciones que NO son camiones: salón y depósitos, para las transferencias. */
export async function listarUbicacionesFijas(opts: {
  schema: string;
  empresaId: string;
}): Promise<Ubicacion[]> {
  const pool = getChatPostgresPool();
  if (!pool) return [];

  const tU = quoteSchemaTable(opts.schema, "inventario_ubicaciones");
  const q = await queryWithRetry<Ubicacion>(
    pool,
    `SELECT id, nombre, tipo FROM ${tU}
      WHERE empresa_id = $1::uuid AND activo = true AND tipo <> 'camion'
      ORDER BY nombre`,
    [opts.empresaId]
  );
  return q.rows;
}

/**
 * Quién es el usuario logueado dentro del schema de la empresa, y con qué rol.
 *
 * Se resuelve por email y no por el id del catálogo: en despliegues donde el
 * catálogo y los datos viven en schemas distintos, ese id no es el de
 * `usuarios` de este schema, y `repartos.repartidor_id` apunta acá.
 *
 * El rol se lee de la fila de la empresa, que es la que el administrador edita
 * desde RRHH.
 */
export async function usuarioDelSchema(opts: {
  schema: string;
  empresaId: string;
  email: string | null | undefined;
}): Promise<{ id: string; rol: string | null } | null> {
  const pool = getChatPostgresPool();
  if (!pool || !opts.email) return null;

  const tU = quoteSchemaTable(opts.schema, "usuarios");
  const q = await queryWithRetry<{ id: string; rol: string | null }>(
    pool,
    `SELECT id, rol FROM ${tU}
      WHERE empresa_id = $1::uuid AND lower(btrim(email)) = lower(btrim($2))
      LIMIT 1`,
    [opts.empresaId, opts.email]
  );
  return q.rows[0] ?? null;
}
