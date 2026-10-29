import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { getConfigContable, generarAsientoEnTx, type AsientoLineaInput } from "@/lib/contabilidad/asientos-pg";

/**
 * Cobro en EFECTIVO de facturas, inmediato.
 *
 * A diferencia de la transferencia (que queda pendiente en Conciliación bancaria
 * hasta que un admin confirma que la plata entró al banco), el efectivo ya está
 * en mano: no hay banco que conciliar, así que el cobro se aplica al instante.
 *
 * Todo ocurre en UNA transacción atómica (o todas las facturas o ninguna). Por
 * cada factura: nace el pago (método 'efectivo') → baja el saldo/estado → y, si
 * la empresa lleva contabilidad (tiene cuenta de Caja configurada), se genera el
 * asiento Debe Caja / Haber Clientes (o Anticipos si la factura todavía no está
 * contabilizada), igual que al aprobar una transferencia pero contra Caja.
 *
 * Si NO hay cuenta de Caja configurada, el cobro igual se registra sin asiento
 * (como el módulo Pagos): no se bloquea a quien no usa el módulo de contabilidad.
 */

export class CobroEfectivoError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

export interface RegistrarEfectivoMultipleInput {
  fecha: string;
  referencia?: string | null;
  created_by: string | null;
  items: { factura_id: string; monto: number }[];
}

export interface CobroEfectivoRow {
  pago_id: string;
  factura_id: string;
  cliente_id: string | null;
  numero_factura: string;
  monto: number;
  nuevo_saldo: number;
  nuevo_estado: string;
  contabilizado: boolean;
}

export async function registrarEfectivoMultiple(
  schemaRaw: string,
  empresaId: string,
  d: RegistrarEfectivoMultipleInput
): Promise<CobroEfectivoRow[]> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tF = quoteSchemaTable(schema, "facturas");
  const tP = quoteSchemaTable(schema, "pagos");

  const items = (d.items ?? []).filter((it) => it && it.factura_id && Number(it.monto) > 0);
  if (items.length === 0) throw new CobroEfectivoError("Seleccioná al menos una factura con monto.");
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(d.fecha)) ? d.fecha : new Date().toISOString().slice(0, 10);
  const referencia = d.referencia?.trim() || null;

  // La contabilidad es opcional: solo asentamos si hay cuenta de Caja cargada.
  const config = await getConfigContable(schema, empresaId);
  const contabiliza = !!config?.cuenta_caja_id;

  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const out: CobroEfectivoRow[] = [];
    for (const it of items) {
      const { rows: fr } = await client.query<{
        estado: string;
        estado_contable: string;
        saldo: string;
        cliente_id: string | null;
        moneda: string;
        numero_factura: string;
      }>(
        `SELECT estado, estado_contable, saldo, cliente_id, moneda, numero_factura
           FROM ${tF} WHERE id=$1::uuid AND empresa_id=$2::uuid FOR UPDATE`,
        [it.factura_id, empresaId]
      );
      const f = fr[0];
      if (!f) throw new CobroEfectivoError("Factura no encontrada.", 404);
      if (["Anulado", "Corregida NC"].includes(f.estado)) {
        throw new CobroEfectivoError(`La factura ${f.numero_factura} está anulada o corregida por NC.`);
      }
      const saldo = Number(f.saldo);
      const monto = Number(it.monto);
      if (monto > saldo) {
        throw new CobroEfectivoError(
          `El monto (${monto}) supera el saldo de la factura ${f.numero_factura} (${saldo}).`
        );
      }

      // Anticipo si la factura todavía no tiene asiento de venta (mismo criterio que la aprobación de transferencias).
      const esAnticipo = f.estado_contable !== "contabilizado";

      // 1) Nace el pago (baja saldo).
      const { rows: pr } = await client.query<{ id: string }>(
        `INSERT INTO ${tP} (empresa_id, factura_id, cliente_id, monto, fecha_pago, metodo_pago, referencia, es_anticipo)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5::date,'efectivo',$6,$7::boolean)
         RETURNING id`,
        [empresaId, it.factura_id, f.cliente_id, monto, fecha, referencia, esAnticipo]
      );
      const pagoId = pr[0].id;

      const nuevoSaldo = Math.max(0, saldo - monto);
      /** CHECK en BD solo admite Pagado | Pendiente | Vencido | Anulado — nunca "Parcial". */
      const nuevoEstado = nuevoSaldo <= 0 ? "Pagado" : f.estado === "Vencido" ? "Vencido" : "Pendiente";
      await client.query(
        `UPDATE ${tF} SET saldo=$3::numeric, estado=$4, updated_at=now() WHERE id=$1::uuid AND empresa_id=$2::uuid`,
        [it.factura_id, empresaId, nuevoSaldo, nuevoEstado]
      );

      // 2) Asiento Debe Caja / Haber Clientes (o Anticipos), solo si hay contabilidad configurada.
      let contabilizado = false;
      if (contabiliza) {
        const ctaHaber = esAnticipo ? config!.cuenta_anticipos_clientes_id : config!.cuenta_clientes_id;
        if (!ctaHaber) {
          throw new CobroEfectivoError(
            esAnticipo
              ? "Configurá la cuenta de Anticipos de Clientes en Configuración Contable."
              : "Configurá la cuenta general de Clientes (CxC) en Configuración Contable."
          );
        }
        const lineas: AsientoLineaInput[] = [
          {
            cuenta_contable_id: config!.cuenta_caja_id!,
            descripcion: "Cobro en efectivo",
            debe: monto,
            haber: 0,
            documento_tipo: "cobro",
            documento_id: pagoId,
          },
          {
            cuenta_contable_id: ctaHaber,
            descripcion: esAnticipo ? "Anticipos de clientes" : "Clientes / CxC",
            debe: 0,
            haber: monto,
            documento_tipo: "cobro",
            documento_id: pagoId,
          },
        ];
        const asiento = await generarAsientoEnTx(client, schema, empresaId, {
          origen_tipo: "cobro_cliente",
          origen_id: pagoId,
          evento_origen: "cobro_efectivo",
          fecha_contable: fecha,
          glosa: `Cobro efectivo ${f.numero_factura}`,
          moneda: f.moneda === "USD" ? "USD" : "PYG",
          tipo_cambio: 1,
          lineas,
          createdBy: d.created_by,
        });
        await client.query(
          `UPDATE ${tP} SET estado_contable='contabilizado', asiento_contable_id=$3::uuid WHERE id=$1::uuid AND empresa_id=$2::uuid`,
          [pagoId, empresaId, asiento.id]
        );
        contabilizado = true;
      }

      out.push({
        pago_id: pagoId,
        factura_id: it.factura_id,
        cliente_id: f.cliente_id,
        numero_factura: f.numero_factura,
        monto,
        nuevo_saldo: nuevoSaldo,
        nuevo_estado: nuevoEstado,
        contabilizado,
      });
    }
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}
