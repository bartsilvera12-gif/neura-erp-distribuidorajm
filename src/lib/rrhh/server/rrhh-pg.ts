import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * RRHH de Distribuidora JM (SQL 51): funcionarios, pagos de salarios y pagos
 * de IPS. Un pago por funcionario y mes de cada tipo (UNIQUE en la tabla).
 *
 * IPS (Paraguay): aporte obrero 9% + aporte patronal 16,5% sobre el salario
 * imponible. El vencimiento viene propuesto (último día del mes siguiente) y
 * se puede corregir en cada pago.
 */

export class RrhhError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export const IPS_OBRERO = 0.09;
export const IPS_PATRONAL = 0.165;

export type TipoPago = "salario" | "ips";
const TABLA: Record<TipoPago, string> = { salario: "rrhh_pagos_salario", ips: "rrhh_pagos_ips" };

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new RrhhError("Pool no disponible.", 500);
  return p;
}

async function tablasListas(schema: string): Promise<void> {
  const q = await pool().query<{ t: string | null }>(`SELECT to_regclass($1)::text AS t`, [`${schema}.funcionarios`]);
  if (!q.rows[0]?.t) throw new RrhhError("Falta correr el SQL 51 (RRHH: funcionarios, salarios e IPS).", 409);
}

export type Funcionario = {
  id: string;
  nombre: string;
  apellido: string | null;
  ci: string | null;
  cargo: string | null;
  telefono: string | null;
  fecha_ingreso: string | null;
  salario_base: number;
  aporta_ips: boolean;
  estado: "activo" | "inactivo";
  observaciones: string | null;
};

export function nombreCompleto(f: { nombre: string; apellido: string | null }): string {
  return [f.nombre, f.apellido].filter((x) => x && x.trim()).join(" ").trim();
}

export async function listarFuncionarios(schemaRaw: string, empresaId: string): Promise<Funcionario[]> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  await tablasListas(schema);
  const { rows } = await pool().query(
    `SELECT id, nombre, apellido, ci, cargo, telefono, fecha_ingreso::text AS fecha_ingreso,
            salario_base::float AS salario_base, aporta_ips, estado, observaciones
       FROM ${quoteSchemaTable(schema, "funcionarios")}
      WHERE empresa_id = $1::uuid
      ORDER BY (estado = 'activo') DESC, nombre, apellido`,
    [empresaId]
  );
  return rows as Funcionario[];
}

export type FuncionarioInput = Omit<Funcionario, "id">;

function limpiarFuncionario(o: Record<string, unknown>): FuncionarioInput {
  const t = (v: unknown) => (v == null ? "" : String(v).trim());
  const nombre = t(o.nombre).toUpperCase();
  if (!nombre) throw new RrhhError("Poné el nombre del funcionario.");
  const salario = Number(String(o.salario_base ?? "0").replace(/\D/g, "") || "0");
  const fecha = t(o.fecha_ingreso);
  return {
    nombre,
    apellido: t(o.apellido).toUpperCase() || null,
    ci: t(o.ci).replace(/[^\dA-Za-z-]/g, "") || null,
    cargo: t(o.cargo).toUpperCase() || null,
    telefono: t(o.telefono) || null,
    fecha_ingreso: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null,
    salario_base: Math.max(0, Math.round(salario)),
    aporta_ips: o.aporta_ips === false ? false : true,
    estado: o.estado === "inactivo" ? "inactivo" : "activo",
    observaciones: t(o.observaciones) || null,
  };
}

function errorDuplicado(e: unknown, mensaje: string): never {
  if ((e as { code?: string })?.code === "23505") throw new RrhhError(mensaje, 409);
  throw e;
}

export async function crearFuncionario(schemaRaw: string, empresaId: string, body: Record<string, unknown>) {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  await tablasListas(schema);
  const f = limpiarFuncionario(body);
  try {
    const { rows } = await pool().query<{ id: string }>(
      `INSERT INTO ${quoteSchemaTable(schema, "funcionarios")}
         (empresa_id, nombre, apellido, ci, cargo, telefono, fecha_ingreso, salario_base, aporta_ips, estado, observaciones)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11)
       RETURNING id`,
      [empresaId, f.nombre, f.apellido, f.ci, f.cargo, f.telefono, f.fecha_ingreso, f.salario_base, f.aporta_ips, f.estado, f.observaciones]
    );
    return rows[0].id;
  } catch (e) {
    errorDuplicado(e, "Ya hay un funcionario con esa cédula.");
  }
}

export async function actualizarFuncionario(schemaRaw: string, empresaId: string, id: string, body: Record<string, unknown>) {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  await tablasListas(schema);
  const f = limpiarFuncionario(body);
  try {
    const r = await pool().query(
      `UPDATE ${quoteSchemaTable(schema, "funcionarios")}
          SET nombre = $3, apellido = $4, ci = $5, cargo = $6, telefono = $7, fecha_ingreso = $8::date,
              salario_base = $9, aporta_ips = $10, estado = $11, observaciones = $12, updated_at = now()
        WHERE id = $1::uuid AND empresa_id = $2::uuid`,
      [id, empresaId, f.nombre, f.apellido, f.ci, f.cargo, f.telefono, f.fecha_ingreso, f.salario_base, f.aporta_ips, f.estado, f.observaciones]
    );
    if (r.rowCount === 0) throw new RrhhError("El funcionario no existe.", 404);
  } catch (e) {
    errorDuplicado(e, "Ya hay un funcionario con esa cédula.");
  }
}

// ── Pagos ───────────────────────────────────────────────────────────────────

export type Pago = {
  id: string;
  funcionario_id: string;
  funcionario_nombre: string;
  periodo: string;
  monto: number;
  fecha_pago: string | null;
  estado: "pendiente" | "pagado";
  observaciones: string | null;
  // Solo IPS
  salario_imponible?: number;
  aporte_obrero?: number;
  aporte_patronal?: number;
  fecha_vencimiento?: string | null;
};

const RE_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Último día del mes siguiente al período: vencimiento propuesto del IPS. */
export function vencimientoIps(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m + 1, 0)); // mes siguiente (m es 1-12), día 0 = último del anterior
  return ultimo.toISOString().slice(0, 10);
}

function calcularIps(salario: number) {
  const obrero = Math.round(salario * IPS_OBRERO);
  const patronal = Math.round(salario * IPS_PATRONAL);
  return { obrero, patronal, total: obrero + patronal };
}

export async function listarPagos(
  schemaRaw: string,
  empresaId: string,
  tipo: TipoPago,
  f: { periodo?: string | null; estado?: string | null; funcionarioId?: string | null }
): Promise<Pago[]> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  await tablasListas(schema);
  const where = ["empresa_id = $1::uuid"];
  const params: unknown[] = [empresaId];
  if (f.periodo && RE_PERIODO.test(f.periodo)) { params.push(f.periodo); where.push(`periodo = $${params.length}`); }
  if (f.estado === "pendiente" || f.estado === "pagado") { params.push(f.estado); where.push(`estado = $${params.length}`); }
  if (f.funcionarioId) { params.push(f.funcionarioId); where.push(`funcionario_id = $${params.length}::uuid`); }
  const extra = tipo === "ips"
    ? `, salario_imponible::float AS salario_imponible, aporte_obrero::float AS aporte_obrero,
         aporte_patronal::float AS aporte_patronal, fecha_vencimiento::text AS fecha_vencimiento`
    : "";
  const { rows } = await pool().query(
    `SELECT id, funcionario_id, funcionario_nombre, periodo, monto::float AS monto,
            fecha_pago::text AS fecha_pago, estado, observaciones ${extra}
       FROM ${quoteSchemaTable(schema, TABLA[tipo])}
      WHERE ${where.join(" AND ")}
      ORDER BY periodo DESC, (estado = 'pendiente') DESC, funcionario_nombre`,
    params
  );
  return rows as Pago[];
}

/**
 * Crea los pagos pendientes del mes para todos los funcionarios activos
 * (salario: su salario base; IPS: solo los que aportan). Los que ya tienen
 * el pago de ese mes no se tocan.
 */
export async function generarPeriodo(schemaRaw: string, empresaId: string, tipo: TipoPago, periodo: string) {
  if (!RE_PERIODO.test(periodo)) throw new RrhhError("Período inválido (AAAA-MM).");
  const schema = assertAllowedChatDataSchema(schemaRaw);
  await tablasListas(schema);
  const tF = quoteSchemaTable(schema, "funcionarios");
  const tP = quoteSchemaTable(schema, TABLA[tipo]);
  const nombre = `upper(btrim(concat_ws(' ', f.nombre, f.apellido)))`;
  const r = tipo === "salario"
    ? await pool().query(
        `INSERT INTO ${tP} (empresa_id, funcionario_id, funcionario_nombre, periodo, monto, estado)
         SELECT f.empresa_id, f.id, ${nombre}, $2, f.salario_base, 'pendiente'
           FROM ${tF} f
          WHERE f.empresa_id = $1::uuid AND f.estado = 'activo'
         ON CONFLICT (empresa_id, funcionario_id, periodo) DO NOTHING`,
        [empresaId, periodo]
      )
    : await pool().query(
        `INSERT INTO ${tP} (empresa_id, funcionario_id, funcionario_nombre, periodo, salario_imponible,
                            aporte_obrero, aporte_patronal, monto, fecha_vencimiento, estado)
         SELECT f.empresa_id, f.id, ${nombre}, $2, f.salario_base,
                round(f.salario_base * $3), round(f.salario_base * $4),
                round(f.salario_base * $3) + round(f.salario_base * $4), $5::date, 'pendiente'
           FROM ${tF} f
          WHERE f.empresa_id = $1::uuid AND f.estado = 'activo' AND f.aporta_ips
         ON CONFLICT (empresa_id, funcionario_id, periodo) DO NOTHING`,
        [empresaId, periodo, IPS_OBRERO, IPS_PATRONAL, vencimientoIps(periodo)]
      );
  return { creados: r.rowCount ?? 0 };
}

/** Un pago a mano (o el de un funcionario que faltaba en el mes). */
export async function crearPago(schemaRaw: string, empresaId: string, tipo: TipoPago, b: Record<string, unknown>) {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  await tablasListas(schema);
  const periodo = String(b.periodo ?? "");
  if (!RE_PERIODO.test(periodo)) throw new RrhhError("Período inválido (AAAA-MM).");
  const fq = await pool().query<{ nombre: string; apellido: string | null; salario_base: string }>(
    `SELECT nombre, apellido, salario_base::text FROM ${quoteSchemaTable(schema, "funcionarios")}
      WHERE id = $1::uuid AND empresa_id = $2::uuid`,
    [String(b.funcionario_id ?? ""), empresaId]
  );
  const f = fq.rows[0];
  if (!f) throw new RrhhError("Elegí el funcionario.");
  const nombre = nombreCompleto(f).toUpperCase();
  const estado = b.estado === "pagado" ? "pagado" : "pendiente";
  const fechaPago = RE_FECHA.test(String(b.fecha_pago ?? "")) ? String(b.fecha_pago) : null;
  if (estado === "pagado" && !fechaPago) throw new RrhhError("Poné la fecha de pago.");
  const montoIn = Number(String(b.monto ?? "").replace(/\D/g, ""));
  try {
    if (tipo === "salario") {
      const monto = montoIn > 0 ? montoIn : Number(f.salario_base);
      await pool().query(
        `INSERT INTO ${quoteSchemaTable(schema, TABLA.salario)}
           (empresa_id, funcionario_id, funcionario_nombre, periodo, monto, fecha_pago, estado, observaciones)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::date, $7, $8)`,
        [empresaId, b.funcionario_id, nombre, periodo, monto, fechaPago, estado, String(b.observaciones ?? "").trim() || null]
      );
    } else {
      const imponibleIn = Number(String(b.salario_imponible ?? "").replace(/\D/g, ""));
      const imponible = imponibleIn > 0 ? imponibleIn : Number(f.salario_base);
      const c = calcularIps(imponible);
      const venc = RE_FECHA.test(String(b.fecha_vencimiento ?? "")) ? String(b.fecha_vencimiento) : vencimientoIps(periodo);
      await pool().query(
        `INSERT INTO ${quoteSchemaTable(schema, TABLA.ips)}
           (empresa_id, funcionario_id, funcionario_nombre, periodo, salario_imponible, aporte_obrero, aporte_patronal,
            monto, fecha_vencimiento, fecha_pago, estado, observaciones)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9::date, $10::date, $11, $12)`,
        [empresaId, b.funcionario_id, nombre, periodo, imponible, c.obrero, c.patronal,
         montoIn > 0 ? montoIn : c.total, venc, fechaPago, estado, String(b.observaciones ?? "").trim() || null]
      );
    }
  } catch (e) {
    errorDuplicado(e, `Ese funcionario ya tiene el ${tipo === "ips" ? "IPS" : "salario"} de ${periodo} cargado.`);
  }
}

/** Editar un pago: importe, fechas, estado, observaciones. */
export async function actualizarPago(schemaRaw: string, empresaId: string, tipo: TipoPago, id: string, b: Record<string, unknown>) {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  await tablasListas(schema);
  const sets: string[] = [];
  const params: unknown[] = [id, empresaId];
  const add = (col: string, v: unknown, cast = "") => { params.push(v); sets.push(`${col} = $${params.length}${cast}`); };
  if (b.monto !== undefined) add("monto", Math.max(0, Number(String(b.monto).replace(/\D/g, "")) || 0));
  if (b.estado !== undefined) add("estado", b.estado === "pagado" ? "pagado" : "pendiente");
  // Volver a pendiente borra la fecha de pago, la hayan mandado o no.
  if (b.estado === "pendiente") sets.push("fecha_pago = NULL");
  else if (b.fecha_pago !== undefined) add("fecha_pago", RE_FECHA.test(String(b.fecha_pago ?? "")) ? b.fecha_pago : null, "::date");
  if (b.observaciones !== undefined) add("observaciones", String(b.observaciones ?? "").trim() || null);
  if (tipo === "ips" && b.fecha_vencimiento !== undefined) {
    add("fecha_vencimiento", RE_FECHA.test(String(b.fecha_vencimiento ?? "")) ? b.fecha_vencimiento : null, "::date");
  }
  if (b.estado === "pagado" && b.fecha_pago === undefined) sets.push("fecha_pago = COALESCE(fecha_pago, (now() AT TIME ZONE 'America/Asuncion')::date)");
  if (sets.length === 0) return;
  const r = await pool().query(
    `UPDATE ${quoteSchemaTable(schema, TABLA[tipo])} SET ${sets.join(", ")}, updated_at = now()
      WHERE id = $1::uuid AND empresa_id = $2::uuid`,
    params
  );
  if (r.rowCount === 0) throw new RrhhError("El pago no existe.", 404);
}

export async function eliminarPago(schemaRaw: string, empresaId: string, tipo: TipoPago, id: string) {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  await tablasListas(schema);
  const r = await pool().query(
    `DELETE FROM ${quoteSchemaTable(schema, TABLA[tipo])} WHERE id = $1::uuid AND empresa_id = $2::uuid AND estado = 'pendiente'`,
    [id, empresaId]
  );
  if (r.rowCount === 0) throw new RrhhError("Solo se puede borrar un pago pendiente.", 409);
}
