import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { cerrarCajasVencidas } from "@/lib/cajas/server/cierre-automatico";

/**
 * Devuelve la caja abierta de la empresa; si no hay ninguna, abre una.
 *
 * El monto de apertura es 0 y no es un valor de relleno: el camión sale sin
 * plata en el cajón y la junta durante la ruta. La caja se cierra con el cierre
 * de reparto, que es el único final de jornada que el repartidor conoce.
 *
 * Todo en una transacción y con la fila bloqueada: dos ventas simultáneas en
 * una empresa sin caja abierta abrirían dos cajas, y las ventas del día
 * quedarían repartidas entre las dos.
 */
export async function asegurarCajaAbierta(
  schema: string,
  empresaId: string,
  usuarioId?: string | null
): Promise<string | null> {
  const pool = getChatPostgresPool();
  if (!pool) return null;

  // Antes de buscar caja: si la abierta pasó las 23:00 de su día, se cierra y
  // esta venta abre una nueva. Va antes de tomar la conexión (usa el pool).
  await cerrarCajasVencidas(pool, schema, empresaId);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existe = await client.query<{ t: string | null }>(
      `SELECT to_regclass($1)::text AS t`,
      [`${schema}.cajas`]
    );
    if (!existe.rows[0]?.t) {
      await client.query("ROLLBACK");
      return null;
    }

    const tC = quoteSchemaTable(schema, "cajas");

    // Quién la abrió, si la tabla lo guarda. Sin esto el arqueo no sabe de
    // quién es la caja y el vendedor termina viendo las de todos.
    const colsQ = await client.query<{ columna: string }>(
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

    /*
     * La caja tiene que ser UNA QUE EL VENDEDOR VEA EN SU ARQUEO.
     *
     * Antes se tomaba cualquier caja abierta de la empresa, la más reciente.
     * Si otra persona tenía una abierta —el administrador probando, otro
     * vendedor—, la venta se imputaba ahí, y el arqueo, que muestra solo las
     * propias, no la mostraba nunca: plata cobrada que no aparecía en el
     * cierre de quien la cobró.
     *
     * El filtro es el mismo que usa el arqueo (`/api/cajas/arqueo`): la suya, o
     * una sin dueño cuando el schema no guarda quién la abrió. Si no hay
     * ninguna, se abre la suya más abajo.
     */
    const filtroDueno =
      colDueno && usuarioId ? ` AND (${colDueno} = $2::uuid OR ${colDueno} IS NULL)` : "";
    // Solo reutilizar la caja si fue abierta en las últimas 24 horas. Antes se
    // tomaba cualquier caja con estado 'abierta' aunque fuera de hace días o
    // semanas: en Distribuidora JM eso dejaba 3 cajas abiertas (una del 22-oct,
    // otra del 03-nov, otra del 04-nov) y las ventas del día se imputaban a la
    // más antigua "a nombre del usuario", partiendo el saldo de caja en dos y
    // generando "diferencias negativas en cierre" sin una causa visible. Ahora,
    // una caja olvidada de días anteriores queda abierta (para que se cierre
    // manualmente con su conteo), pero el próximo cobro abre una nueva.
    const abierta = await client.query<{ id: string }>(
      `SELECT id FROM ${tC}
        WHERE empresa_id = $1::uuid AND estado = 'abierta'${filtroDueno}
          AND fecha_apertura > (now() - interval '24 hours')
        ORDER BY ${colDueno && usuarioId ? `(${colDueno} IS NULL), ` : ""}fecha_apertura DESC
        LIMIT 1
        FOR UPDATE`,
      filtroDueno ? [empresaId, usuarioId] : [empresaId]
    );
    if (abierta.rows.length > 0) {
      await client.query("COMMIT");
      return abierta.rows[0].id;
    }

    const sig = await client.query<{ n: string }>(
      `SELECT COALESCE(max(numero_caja), 0)::text AS n FROM ${tC} WHERE empresa_id = $1::uuid`,
      [empresaId]
    );
    const alta = await client.query<{ id: string }>(
      `INSERT INTO ${tC} (empresa_id, numero_caja, estado, monto_apertura, fecha_apertura${
        colDueno && usuarioId ? `, ${colDueno}` : ""
      })
       VALUES ($1::uuid, $2, 'abierta', 0, now()${colDueno && usuarioId ? ", $3::uuid" : ""})
       RETURNING id`,
      colDueno && usuarioId
        ? [empresaId, Number(sig.rows[0].n) + 1, usuarioId]
        : [empresaId, Number(sig.rows[0].n) + 1]
    );

    await client.query("COMMIT");
    return alta.rows[0].id;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[asegurarCajaAbierta]", err instanceof Error ? err.message : err);
    return null;
  } finally {
    client.release();
  }
}
