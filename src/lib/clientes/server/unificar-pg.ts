import "server-only";
import type { Pool } from "pg";
import { quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { documentosDe, normalizarNombre } from "@/lib/clientes/dedupe";
import { nombreClienteDisplay } from "@/lib/clientes/display-name";

/**
 * Clientes duplicados: el mismo cliente cargado dos veces (por ejemplo, una en
 * el salón con la cédula y otra en el camión con el RUC). Se encuentran por
 * documento (la cédula detrás del RUC) o por el mismo nombre, y se unifican:
 * todo lo que tenía el duplicado (ventas, facturas, recibos, cobros…) pasa al
 * que se conserva, y el duplicado se da de baja. Así queda un solo historial.
 */

export type ClienteDuplicado = {
  id: string;
  nombre: string;
  ruc: string | null;
  documento: string | null;
  telefono: string | null;
  direccion: string | null;
  creado: string | null;
  /** Cuántas ventas tiene: ayuda a elegir cuál conservar. */
  ventas: number;
};

export type GrupoDuplicados = {
  motivo: "documento" | "nombre";
  /** La cédula / RUC o el nombre que comparten. */
  valor: string;
  clientes: ClienteDuplicado[];
};

export class UnificarError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function buscarGruposDuplicados(pool: Pool, schemaRaw: string, empresaId: string): Promise<GrupoDuplicados[]> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const r = await pool.query<{ j: Record<string, unknown> }>(
    `SELECT to_jsonb(c) AS j FROM ${quoteSchemaTable(schema, "clientes")} c
      WHERE c.empresa_id = $1::uuid AND c.deleted_at IS NULL`,
    [empresaId]
  );
  const ventas = new Map<string, number>();
  const v = await pool.query<{ cliente_id: string; n: string }>(
    `SELECT cliente_id::text, count(*)::text AS n FROM ${quoteSchemaTable(schema, "ventas")}
      WHERE empresa_id = $1::uuid AND cliente_id IS NOT NULL GROUP BY 1`,
    [empresaId]
  );
  for (const x of v.rows) ventas.set(x.cliente_id, Number(x.n));

  const clientes = r.rows.map(({ j }) => ({
    j,
    c: {
      id: String(j.id),
      nombre: nombreClienteDisplay(j, "").trim() || "Sin nombre",
      ruc: txt(j.ruc_factura) ?? txt(j.ruc),
      documento: txt(j.documento),
      telefono: txt(j.telefono),
      direccion: txt(j.direccion),
      creado: txt(j.created_at),
      ventas: ventas.get(String(j.id)) ?? 0,
    } satisfies ClienteDuplicado,
  }));

  // Grupos por documento; los que no cayeron en uno, por nombre igual.
  const porDoc = new Map<string, ClienteDuplicado[]>();
  for (const x of clientes) {
    for (const d of documentosDe(x.j)) {
      const l = porDoc.get(d) ?? [];
      if (!l.some((y) => y.id === x.c.id)) l.push(x.c);
      porDoc.set(d, l);
    }
  }
  const grupos: GrupoDuplicados[] = [];
  const yaAgrupados = new Set<string>();
  const firmas = new Set<string>();
  for (const [doc, l] of porDoc) {
    if (l.length < 2) continue;
    const firma = l.map((c) => c.id).sort().join(",");
    if (firmas.has(firma)) continue;
    firmas.add(firma);
    l.forEach((c) => yaAgrupados.add(c.id));
    grupos.push({ motivo: "documento", valor: doc, clientes: l });
  }
  const porNombre = new Map<string, ClienteDuplicado[]>();
  for (const x of clientes) {
    const n = normalizarNombre(x.c.nombre);
    if (n.length < 3 || n === "SIN NOMBRE") continue;
    porNombre.set(n, [...(porNombre.get(n) ?? []), x.c]);
  }
  for (const [n, l] of porNombre) {
    if (l.length < 2 || l.every((c) => yaAgrupados.has(c.id))) continue;
    grupos.push({ motivo: "nombre", valor: n, clientes: l });
  }
  for (const g of grupos) g.clientes.sort((a, b) => b.ventas - a.ventas || (a.creado ?? "").localeCompare(b.creado ?? ""));
  return grupos.sort((a, b) => (a.motivo === b.motivo ? a.clientes[0].nombre.localeCompare(b.clientes[0].nombre) : a.motivo === "documento" ? -1 : 1));
}

/** Datos de la ficha que se completan en el que se conserva si le faltan. */
const COMPLETAR = ["ruc", "ruc_factura", "documento", "razon_social", "telefono", "email", "direccion", "ciudad"];

/**
 * Pasa todo lo de `duplicados` al cliente `conservar` y da de baja los
 * duplicados. Mueve cualquier columna que apunte a clientes (las `cliente_id`
 * y las claves foráneas a `clientes`), en una sola transacción.
 */
export async function unificarClientes(
  pool: Pool,
  schemaRaw: string,
  empresaId: string,
  conservar: string,
  duplicados: string[]
): Promise<{ movidos: Record<string, number>; unificados: string[] }> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const dups = [...new Set(duplicados)].filter((d) => UUID.test(d) && d !== conservar);
  if (!UUID.test(conservar) || dups.length === 0) throw new UnificarError("Elegí el cliente que queda y al menos un duplicado.");
  const tCl = quoteSchemaTable(schema, "clientes");

  // Columnas que apuntan a un cliente: claves foráneas a clientes y, por las
  // dudas, cualquier `cliente_id` sin clave foránea.
  const refs = await pool.query<{ tabla: string; columna: string }>(
    `SELECT DISTINCT tabla, columna FROM (
       SELECT cl.relname AS tabla, a.attname AS columna
         FROM pg_constraint k
         JOIN pg_class cl ON cl.oid = k.conrelid
         JOIN pg_namespace ns ON ns.oid = cl.relnamespace
         JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY(k.conkey)
        WHERE k.contype = 'f' AND k.confrelid = $2::regclass AND ns.nspname = $1 AND array_length(k.conkey, 1) = 1
       UNION
       SELECT c.table_name, c.column_name
         FROM information_schema.columns c
         JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema = $1 AND c.column_name = 'cliente_id' AND c.data_type IN ('uuid', 'text')
     ) x WHERE tabla <> 'clientes' ORDER BY 1, 2`,
    [schema, `${schema}.clientes`]
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ids = await client.query<{ id: string }>(
      `SELECT id::text FROM ${tCl} WHERE empresa_id = $1::uuid AND id = ANY($2::uuid[]) AND deleted_at IS NULL FOR UPDATE`,
      [empresaId, [conservar, ...dups]]
    );
    const encontrados = new Set(ids.rows.map((x) => x.id));
    if (!encontrados.has(conservar)) throw new UnificarError("El cliente que queda no existe o ya fue dado de baja.");
    const aMover = dups.filter((d) => encontrados.has(d));
    if (aMover.length === 0) throw new UnificarError("Los duplicados ya no existen.");

    const movidos: Record<string, number> = {};
    for (const { tabla, columna } of refs.rows) {
      const t = quoteSchemaTable(schema, tabla);
      const col = `"${columna.replace(/"/g, '""')}"`;
      // Una restricción única puede no dejar mover una fila (por ejemplo, un
      // perfil por cliente): esa queda con el duplicado dado de baja.
      await client.query("SAVEPOINT mover");
      try {
        const u = await client.query(`UPDATE ${t} SET ${col} = $1::uuid WHERE ${col}::text = ANY($2::text[])`, [conservar, aMover]);
        await client.query("RELEASE SAVEPOINT mover");
        if (u.rowCount) movidos[tabla] = (movidos[tabla] ?? 0) + u.rowCount;
      } catch (e) {
        await client.query("ROLLBACK TO SAVEPOINT mover");
        console.error(`[unificarClientes] ${tabla}.${columna}:`, e instanceof Error ? e.message : e);
      }
    }

    // Completar en el que queda los datos que le falten.
    const cols = new Set(
      (
        await client.query<{ c: string }>(
          `SELECT column_name AS c FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'clientes'`,
          [schema]
        )
      ).rows.map((x) => x.c)
    );
    const completar = COMPLETAR.filter((c) => cols.has(c));
    if (completar.length > 0) {
      const sets = completar.map(
        (c) => `"${c}" = COALESCE(NULLIF(btrim(k."${c}"::text), '')::text, (
            SELECT NULLIF(btrim(d."${c}"::text), '') FROM ${tCl} d
             WHERE d.id = ANY($2::uuid[]) AND NULLIF(btrim(d."${c}"::text), '') IS NOT NULL LIMIT 1))`
      );
      await client.query(`UPDATE ${tCl} k SET ${sets.join(", ")} WHERE k.id = $1::uuid`, [conservar, aMover]);
    }

    // Los duplicados se dan de baja (no se borran: su historial ya pasó al que queda).
    await client.query(
      `UPDATE ${tCl} SET deleted_at = now()${cols.has("estado") ? ", estado = 'inactivo'" : ""}
        WHERE id = ANY($1::uuid[]) AND empresa_id = $2::uuid`,
      [aMover, empresaId]
    );
    await client.query("COMMIT");
    return { movidos, unificados: aMover };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
