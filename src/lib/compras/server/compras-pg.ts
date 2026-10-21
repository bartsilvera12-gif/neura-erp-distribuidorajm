/**
 * PG directo para Compras. Mismo patron que productos-pg / proveedores-pg:
 * pool singleton + queries parametrizadas + identifier escape.
 *
 * insertCompra realiza la operacion en transaccion:
 *   1) inserta compra con numero_control generado por secuencia local
 *   2) inserta movimiento ENTRADA (origen=compra) con audit
 *   3) actualiza producto.precio_venta + costo_promedio + stock_actual
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { getConfigContable, construirLineasDocumento, generarAsientoEnTx, getAsientoConDetalles, ContabilidadError } from "@/lib/contabilidad/asientos-pg";
import { recalcularEstadoOrdenEnTx } from "@/lib/ordenes/server/ordenes-pg";
import { recalcularFacturacionRecepcionEnTx } from "@/lib/recepciones/server/recepciones-pg";

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

export interface CompraRow {
  id: string;
  empresa_id: string;
  proveedor_id: string;
  proveedor_nombre: string;
  producto_id: string;
  producto_nombre: string;
  cantidad: string | number;
  moneda: string;
  tipo_cambio: string | number;
  costo_unitario_original: string | number;
  costo_unitario: string | number;
  iva_tipo: string;
  subtotal: string | number;
  monto_iva: string | number;
  total: string | number;
  precio_venta: string | number;
  margen_venta: string | number | null;
  tipo_pago: string;
  plazo_dias: number | null;
  cuotas: number | null;
  nro_timbrado: string;
  numero_control: string;
  estado: string;
  fecha: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  usuario_nombre: string | null;
  cuenta_contable_id: string | null;
  numero_comprobante: string | null;
  tipo_comprobante: string | null;
  documento_path: string | null;
  documento_mime: string | null;
  cuenta_contable_codigo?: string | null;
  cuenta_contable_denominacion?: string | null;
}

const COLS = `
  id, empresa_id, proveedor_id, proveedor_nombre, producto_id, producto_nombre,
  cantidad, moneda, tipo_cambio, costo_unitario_original, costo_unitario,
  iva_tipo, subtotal, monto_iva, total, precio_venta, margen_venta,
  tipo_pago, plazo_dias, cuotas, nro_timbrado, numero_control, estado, fecha,
  created_at, updated_at, created_by, usuario_nombre, cuenta_contable_id,
  numero_comprobante, tipo_comprobante, documento_path, documento_mime
`;

export interface InsertCompraInput {
  proveedor_id: string;
  proveedor_nombre: string;
  producto_id: string;
  producto_nombre: string;
  cantidad: number;
  moneda: string;
  tipo_cambio: number;
  costo_unitario_original: number;
  costo_unitario: number;
  iva_tipo: string;
  subtotal: number;
  monto_iva: number;
  total: number;
  precio_venta: number;
  margen_venta: number | null;
  tipo_pago: string;
  plazo_dias: number | null;
  cuotas: number | null;
  nro_timbrado: string;
  /** N° de la factura del proveedor (001-001-0000001). */
  numero_comprobante?: string | null;
  /** Tipo de comprobante ('Factura' por defecto). */
  tipo_comprobante?: string | null;
  cuenta_contable_id: string | null;
  /** Cuenta de pago (contrapartida) para compras al contado. */
  cuenta_contrapartida_id: string | null;
  /** true = compra directa que aumenta stock (Fase 0). false = provendrá de recepción (Fase 4). */
  afecta_stock: boolean;
  /** Clave de idempotencia (uuid) para que un doble-envío no cree dos compras. */
  idempotency_key: string | null;
  created_by: string | null;
  usuario_nombre: string | null;
}

export async function listCompras(
  schemaRaw: string,
  empresaId: string
): Promise<CompraRow[]> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = quoteSchemaTable(schema, "compras");
  const tPC = quoteSchemaTable(schema, "plan_cuentas");
  const cols = COLS.split(",")
    .map((c) => `c.${c.trim()}`)
    .join(", ");
  const { rows } = await pool().query<CompraRow>(
    `SELECT ${cols},
            pc.cuenta AS cuenta_contable_codigo,
            pc.denominacion AS cuenta_contable_denominacion
       FROM ${t} c
       LEFT JOIN ${tPC} pc ON pc.id = c.cuenta_contable_id
      WHERE c.empresa_id = $1::uuid
      ORDER BY c.fecha DESC LIMIT 500`,
    [empresaId]
  );
  return rows;
}

/**
 * Actualiza SOLO la cuenta contable de una compra (edición acotada).
 * `cuentaContableId` null desasocia. Si es no-null, valida que la cuenta
 * pertenezca a la empresa y sea activa + asentable; si no, lanza error.
 */
export async function updateCompraCuentaContable(
  schemaRaw: string,
  empresaId: string,
  compraId: string,
  cuentaContableId: string | null
): Promise<CompraRow | null> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tC = quoteSchemaTable(schema, "compras");
  const tPC = quoteSchemaTable(schema, "plan_cuentas");

  if (cuentaContableId) {
    const { rows: valid } = await pool().query<{ id: string }>(
      `SELECT id FROM ${tPC}
        WHERE id = $1::uuid AND empresa_id = $2::uuid AND activo = true AND asentable = true`,
      [cuentaContableId, empresaId]
    );
    if (valid.length === 0) {
      throw new Error("La cuenta contable seleccionada no es válida (debe estar activa y ser asentable).");
    }
  }

  const cols = COLS.split(",")
    .map((c) => `c.${c.trim()}`)
    .join(", ");
  const { rows } = await pool().query<CompraRow>(
    `WITH upd AS (
       UPDATE ${tC} SET cuenta_contable_id = $1::uuid, updated_at = now()
        WHERE id = $2::uuid AND empresa_id = $3::uuid
        RETURNING *
     )
     SELECT ${cols},
            pc.cuenta AS cuenta_contable_codigo,
            pc.denominacion AS cuenta_contable_denominacion
       FROM upd c
       LEFT JOIN ${tPC} pc ON pc.id = c.cuenta_contable_id`,
    [cuentaContableId, compraId, empresaId]
  );
  return rows[0] ?? null;
}

/** Genera proximo COMP-XXXXXX leyendo el maximo existente. */
async function nextNumeroControl(
  client: import("pg").PoolClient,
  schema: string,
  empresaId: string
): Promise<string> {
  const t = quoteSchemaTable(schema, "compras");
  const { rows } = await client.query<{ maxn: number | null }>(
    `SELECT COALESCE(MAX(
       CASE WHEN numero_control ~ '^COMP-[0-9]+$'
            THEN (substring(numero_control from 6))::int
            ELSE 0 END
     ), 0) AS maxn
     FROM ${t} WHERE empresa_id = $1::uuid`,
    [empresaId]
  );
  const next = Number(rows[0]?.maxn ?? 0) + 1;
  return `COMP-${String(next).padStart(6, "0")}`;
}

export interface CompraResult {
  compra: CompraRow;
  movimiento_id: string | null;
  movimiento_warning: string | null;
}

export type IvaTipo = "exenta" | "5" | "10";

export interface CompraItemInput {
  producto_id: string | null;
  producto_nombre: string;
  descripcion: string | null;
  cantidad: number;
  costo_unitario: number;
  iva_tipo: IvaTipo;
  /** Obligatoria salvo en una compra `sin_asiento`. */
  cuenta_contable_id: string | null;
  /** Si viene de una recepción: la línea NO impacta inventario (ya entró con la recepción). */
  recepcion_item_id: string | null;
  /** Solo para compra directa: actualiza el precio de venta del producto. */
  precio_venta?: number | null;
  margen_venta?: number | null;
}

export interface CompraMultilineaInput {
  proveedor_id: string;
  proveedor_nombre: string;
  orden_compra_id: string | null;
  origen_compra: "directa" | "recepcion";
  moneda: string;
  tipo_cambio: number;
  tipo_pago: string;
  plazo_dias: number | null;
  cuotas: number | null;
  nro_timbrado: string | null;
  numero_comprobante: string | null;
  tipo_comprobante: string | null;
  cuenta_contrapartida_id: string | null;
  items: CompraItemInput[];
  idempotency_key: string | null;
  created_by: string | null;
  usuario_nombre: string | null;
  /**
   * Compra sin contabilidad: no pide cuentas ni genera asiento. Queda el stock
   * y, si es a crédito, la deuda con el proveedor (cuentas por pagar sale de
   * la propia compra).
   */
  sin_asiento?: boolean;
  /**
   * Adónde entra la mercadería de una compra directa: la ubicación de un
   * camión. `null` = salón (el salón no lleva filas propias: es el total de la
   * empresa menos lo que está arriba de los camiones).
   */
  destino_ubicacion_id?: string | null;
}

/** IVA INCLUIDO: el costo cargado es el total con IVA; el IVA se DEDUCE. */
const IVA_FACTOR_INCL: Record<IvaTipo, number> = { exenta: 0, "5": 5 / 105, "10": 10 / 110 };

function calcLinea(cantidad: number, costoUnitario: number, iva: IvaTipo) {
  const bruto = (Number(cantidad) || 0) * (Number(costoUnitario) || 0);
  const monto_iva = Math.round(bruto * IVA_FACTOR_INCL[iva]);
  return { subtotal: bruto - monto_iva, monto_iva, total_linea: bruto };
}

/** Busca una compra por su clave de idempotencia (fuera de transacción). */
async function fetchCompraByIdempotency(
  schema: string,
  empresaId: string,
  idempotencyKey: string
): Promise<CompraRow | null> {
  const tC = quoteSchemaTable(schema, "compras");
  const { rows } = await pool().query<CompraRow>(
    `SELECT ${COLS} FROM ${tC} WHERE empresa_id = $1::uuid AND idempotency_key = $2::uuid LIMIT 1`,
    [empresaId, idempotencyKey]
  );
  return rows[0] ?? null;
}

/**
 * Alta de compra MULTILÍNEA (cabecera + ítems), TODO en una única transacción.
 *
 *  - origen_compra='directa'   → afecta_stock=true: crea 1 movimiento por producto
 *                                (documento_tipo='compra') y actualiza stock/precio.
 *  - origen_compra='recepcion' → afecta_stock=false: NO crea movimiento (el stock ya
 *                                entró con la recepción) y consume cantidad recibida
 *                                pendiente de facturar, con lock FOR UPDATE.
 *  - Siempre genera el asiento contable usando la cuenta de CADA línea y aparece
 *    en Libro de Compras / Diario / Mayor.
 *  - Idempotencia por `idempotency_key`: un doble-envío devuelve la compra ya creada.
 */
export async function insertCompraMultilinea(
  schemaRaw: string,
  empresaId: string,
  d: CompraMultilineaInput,
  opts: {
    /** Editar: anula la compra original en la MISMA transacción que crea la nueva. */
    reemplazaCompraId?: string | null;
  } = {}
): Promise<CompraResult> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tC = quoteSchemaTable(schema, "compras");
  const tCI = quoteSchemaTable(schema, "compra_items");
  const tM = quoteSchemaTable(schema, "movimientos_inventario");
  const tP = quoteSchemaTable(schema, "productos");
  const tRI = quoteSchemaTable(schema, "recepcion_items");
  const tOCI = quoteSchemaTable(schema, "orden_compra_items");
  const tSU = quoteSchemaTable(schema, "inventario_stock_ubicacion");
  const destino = d.origen_compra === "directa" ? (d.destino_ubicacion_id ?? null) : null;

  if (!Array.isArray(d.items) || d.items.length === 0) {
    throw new ContabilidadError("La compra requiere al menos una línea.");
  }
  for (const [i, it] of d.items.entries()) {
    if (!(Number(it.cantidad) > 0)) throw new ContabilidadError(`Línea ${i + 1}: la cantidad debe ser mayor a 0.`);
    if (!(Number(it.costo_unitario) > 0)) throw new ContabilidadError(`Línea ${i + 1}: el costo unitario debe ser mayor a 0.`);
    if (!["exenta", "5", "10"].includes(it.iva_tipo)) throw new ContabilidadError(`Línea ${i + 1}: tipo de IVA inválido.`);
    if (!d.sin_asiento && !it.cuenta_contable_id) throw new ContabilidadError(`Línea ${i + 1}: falta la cuenta contable.`);
  }
  const desdeRecepcion = d.origen_compra === "recepcion";
  const afectaStock = !desdeRecepcion;
  if (desdeRecepcion && d.items.some((it) => !it.recepcion_item_id)) {
    throw new ContabilidadError("Toda línea de una compra por recepción debe referenciar un ítem recibido.");
  }

  if (d.idempotency_key) {
    const existing = await fetchCompraByIdempotency(schema, empresaId, d.idempotency_key);
    if (existing) return { compra: existing, movimiento_id: null, movimiento_warning: null };
  }

  type LineaCalc = CompraItemInput & {
    subtotal: number; monto_iva: number; total_linea: number;
    _costo_ordenado?: number | null; _costo_recibido?: number | null;
  };
  const calculadas: LineaCalc[] = d.items.map((it) => ({ ...it, ...calcLinea(it.cantidad, it.costo_unitario, it.iva_tipo) }));
  const subtotal = calculadas.reduce((s, l) => s + l.subtotal, 0);
  const montoIva = calculadas.reduce((s, l) => s + l.monto_iva, 0);
  const total = calculadas.reduce((s, l) => s + l.total_linea, 0);
  const ivasDistintos = Array.from(new Set(calculadas.map((l) => l.iva_tipo)));
  // La cabecera solo admite exenta / 5 / 10 (CHECK de la tabla): con IVA
  // mezclado va el de mayor importe. El IVA real de cada renglón queda en
  // compra_items, que es de donde salen los totales.
  const porIva = new Map<IvaTipo, number>();
  for (const l of calculadas) porIva.set(l.iva_tipo, (porIva.get(l.iva_tipo) ?? 0) + l.total_linea);
  const ivaCabecera: IvaTipo =
    ivasDistintos.length === 1
      ? ivasDistintos[0]
      : [...porIva.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const primera = calculadas[0];

  const client = await pool().connect();
  let movimientoId: string | null = null;
  try {
    await client.query("BEGIN");

    // Editar = anular la original y crear la corregida, todo o nada.
    if (opts.reemplazaCompraId) {
      await anularCompraEnTx(client, schema, empresaId, opts.reemplazaCompraId, {
        usuario: d.usuario_nombre,
        createdBy: d.created_by,
        permitirNegativo: true,
      });
    }

    const numero = await nextNumeroControl(client, schema, empresaId);

    let compra: CompraRow;
    try {
      const { rows } = await client.query<CompraRow>(
        `INSERT INTO ${tC} (
           empresa_id, proveedor_id, proveedor_nombre, producto_id, producto_nombre,
           cantidad, moneda, tipo_cambio, costo_unitario_original, costo_unitario,
           iva_tipo, subtotal, monto_iva, total, precio_venta, margen_venta,
           tipo_pago, plazo_dias, cuotas, nro_timbrado, numero_control, estado, fecha,
           created_by, usuario_nombre, cuenta_contable_id, afecta_stock, idempotency_key,
           cuenta_contrapartida_id, orden_compra_id, origen_compra,
           numero_comprobante, tipo_comprobante
         ) VALUES (
           $1::uuid,$2::uuid,$3,$4::uuid,$5,
           $6::numeric,$7,$8::numeric,$9::numeric,$10::numeric,
           $11,$12::numeric,$13::numeric,$14::numeric,$15::numeric,$16::numeric,
           $17,$18::integer,$31::integer,$19,$20,'registrada',now(),
           $21::uuid,$22,$23::uuid,$24::boolean,$25::uuid,$26::uuid,$27::uuid,$28,
           $29,COALESCE(NULLIF($30,''),'Factura')
         ) RETURNING ${COLS}`,
        [
          empresaId, d.proveedor_id, d.proveedor_nombre, primera.producto_id, primera.producto_nombre,
          calculadas.reduce((s, l) => s + Number(l.cantidad), 0), d.moneda, d.tipo_cambio,
          primera.costo_unitario, primera.costo_unitario,
          ivaCabecera, subtotal, montoIva, total,
          Number(primera.precio_venta) || 0, primera.margen_venta ?? null,
          d.tipo_pago, d.plazo_dias, d.nro_timbrado, numero,
          d.created_by, d.usuario_nombre, primera.cuenta_contable_id, afectaStock, d.idempotency_key,
          d.cuenta_contrapartida_id, d.orden_compra_id, d.origen_compra,
          d.numero_comprobante, d.tipo_comprobante,
          d.tipo_pago === "credito" ? Math.max(1, Number(d.cuotas) || 1) : 1,
        ]
      );
      compra = rows[0];
    } catch (insErr) {
      const code = (insErr as { code?: string })?.code;
      const constraint = String((insErr as { constraint?: string })?.constraint ?? "");
      if (code === "23505" && constraint.includes("idempotency") && d.idempotency_key) {
        await client.query("ROLLBACK").catch(() => null);
        const existing = await fetchCompraByIdempotency(schema, empresaId, d.idempotency_key);
        if (existing) return { compra: existing, movimiento_id: null, movimiento_warning: null };
      }
      throw insErr;
    }

    // ── Consumo de lo recibido pendiente de facturar (anti doble facturación) ──
    const recepcionesTocadas = new Set<string>();
    const ordenesTocadas = new Set<string>();
    if (d.orden_compra_id) ordenesTocadas.add(d.orden_compra_id);
    if (desdeRecepcion) {
      for (const l of calculadas) {
        const { rows: ri } = await client.query<{
          id: string; recepcion_id: string; cantidad_recibida: string; cantidad_facturada: string;
          producto_nombre: string | null; orden_item_id: string | null; costo_unitario_recibido: string;
        }>(
          `SELECT id, recepcion_id, cantidad_recibida::text, cantidad_facturada::text,
                  producto_nombre, orden_item_id, costo_unitario_recibido::text
             FROM ${tRI} WHERE id = $1::uuid AND empresa_id = $2::uuid FOR UPDATE`,
          [l.recepcion_item_id, empresaId]
        );
        if (!ri[0]) throw new ContabilidadError("El ítem de recepción indicado no existe.", 404);
        const recibida = Number(ri[0].cantidad_recibida);
        const yaFact = Number(ri[0].cantidad_facturada);
        const pendiente = recibida - yaFact;
        if (Number(l.cantidad) > pendiente + 1e-9) {
          throw new ContabilidadError(
            `"${ri[0].producto_nombre ?? "Ítem"}": pendiente de facturar ${pendiente}; estás facturando ${l.cantidad}.`,
            409
          );
        }
        await client.query(
          `UPDATE ${tRI} SET cantidad_facturada = cantidad_facturada + $1::numeric, updated_at = now()
            WHERE id = $2::uuid AND empresa_id = $3::uuid`,
          [l.cantidad, ri[0].id, empresaId]
        );
        recepcionesTocadas.add(ri[0].recepcion_id);

        // Trazabilidad de diferencias: costo ordenado / recibido / facturado.
        let costoOrdenado: number | null = null;
        if (ri[0].orden_item_id) {
          const { rows: oi } = await client.query<{ costo_unitario_estimado: string; orden_id: string }>(
            `SELECT costo_unitario_estimado::text, orden_id FROM ${tOCI} WHERE id = $1::uuid AND empresa_id = $2::uuid`,
            [ri[0].orden_item_id, empresaId]
          );
          if (oi[0]) { costoOrdenado = Number(oi[0].costo_unitario_estimado); ordenesTocadas.add(oi[0].orden_id); }
        }
        l._costo_ordenado = costoOrdenado;
        l._costo_recibido = Number(ri[0].costo_unitario_recibido);
      }
    }

    // ── Ítems de la compra ──
    for (const [i, l] of calculadas.entries()) {
      await client.query(
        `INSERT INTO ${tCI} (empresa_id, compra_id, producto_id, producto_nombre, descripcion, cantidad,
           costo_unitario, iva_tipo, subtotal, monto_iva, total_linea, cuenta_contable_id,
           recepcion_item_id, afecta_inventario, costo_unitario_ordenado, costo_unitario_recibido, orden_linea)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::numeric,$7::numeric,$8,$9::numeric,$10::numeric,
                 $11::numeric,$12::uuid,$13::uuid,$14::boolean,$15::numeric,$16::numeric,$17)`,
        [empresaId, compra.id, l.producto_id, l.producto_nombre, l.descripcion, l.cantidad,
         l.costo_unitario, l.iva_tipo, l.subtotal, l.monto_iva, l.total_linea, l.cuenta_contable_id,
         l.recepcion_item_id, afectaStock && !!l.producto_id,
         l._costo_ordenado ?? null, l._costo_recibido ?? null, i + 1]
      );
    }

    // ── Inventario: SOLO compra directa. Un movimiento por producto. ──
    if (afectaStock) {
      const porProducto = new Map<string, { cantidad: number; costoPonderado: number; nombre: string; precioVenta: number | null }>();
      for (const l of calculadas) {
        if (!l.producto_id) continue;
        const prev = porProducto.get(l.producto_id) ?? { cantidad: 0, costoPonderado: 0, nombre: l.producto_nombre, precioVenta: null };
        prev.cantidad += Number(l.cantidad);
        prev.costoPonderado += Number(l.cantidad) * Number(l.costo_unitario);
        if (l.precio_venta != null && Number(l.precio_venta) > 0) prev.precioVenta = Number(l.precio_venta);
        porProducto.set(l.producto_id, prev);
      }
      for (const [productoId, agg] of porProducto) {
        const costoUnit = agg.cantidad > 0 ? agg.costoPonderado / agg.cantidad : 0;
        const { rows: mov } = await client.query<{ id: string }>(
          `INSERT INTO ${tM} (empresa_id, producto_id, producto_nombre, producto_sku, tipo, cantidad,
             costo_unitario, origen, referencia, fecha, created_by, usuario_nombre, documento_tipo, documento_id
             ${destino ? ", ubicacion_id" : ""})
           SELECT $1::uuid,$2::uuid,$3,COALESCE(p.sku::text,''),'ENTRADA',$4::numeric,$5::numeric,
                  'compra',$6,now(),$7::uuid,$8,'compra',$9::uuid
                  ${destino ? ", $10::uuid" : ""}
             FROM ${tP} p WHERE p.id = $2::uuid AND p.empresa_id = $1::uuid
           RETURNING id`,
          [empresaId, productoId, agg.nombre, agg.cantidad, costoUnit, numero, d.created_by, d.usuario_nombre, compra.id,
           ...(destino ? [destino] : [])]
        );
        if (!mov[0]?.id) throw new Error("No se pudo registrar el movimiento de inventario (producto inexistente).");
        movimientoId = movimientoId ?? mov[0].id;

        const upd = await client.query(
          `UPDATE ${tP}
              SET stock_actual = COALESCE(stock_actual,0) + $1::numeric,
                  costo_promedio = $2::numeric,
                  precio_venta = COALESCE($3::numeric, precio_venta),
                  updated_at = now()
            WHERE id = $4::uuid AND empresa_id = $5::uuid`,
          [agg.cantidad, costoUnit, agg.precioVenta, productoId, empresaId]
        );
        if (upd.rowCount === 0) throw new Error("No se pudo actualizar el stock del producto.");

        // Compra a un camión: la mercadería entra arriba de ese camión. El total
        // de la empresa ya subió arriba; acá se dice dónde está.
        if (destino) {
          await client.query(
            `INSERT INTO ${tSU} (empresa_id, producto_id, ubicacion_id, stock_actual)
             VALUES ($1::uuid, $2::uuid, $3::uuid, $4::numeric)
             ON CONFLICT (empresa_id, producto_id, ubicacion_id)
             DO UPDATE SET stock_actual = ${tSU}.stock_actual + EXCLUDED.stock_actual, updated_at = now()`,
            [empresaId, productoId, destino, agg.cantidad]
          );
        }
      }
    }

    // ── Contabilidad: cuenta de CADA línea al Debe + IVA Crédito; Haber caja/banco o proveedores ──
    // Una compra sin asiento termina acá (más los estados de recepción/orden).
    if (!d.sin_asiento) {
      const config = await getConfigContable(schema, empresaId);
      const lineasAsiento = construirLineasDocumento({
        config,
        lineasFiscales: calculadas.map((l) => ({
          cuenta_contable_id: l.cuenta_contable_id as string,
          descripcion: l.descripcion || l.producto_nombre,
          subtotal: l.subtotal,
          iva_tipo: l.iva_tipo,
          monto_iva: l.monto_iva,
        })),
        total,
        esContado: d.tipo_pago !== "credito",
        contrapartidaContado: d.cuenta_contrapartida_id,
        proveedorId: d.proveedor_id,
        documento_tipo: "compra",
        documento_id: compra.id,
      });
      const now = new Date();
      const fechaContable = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const asiento = await generarAsientoEnTx(client, schema, empresaId, {
        origen_tipo: "compra", origen_id: compra.id, evento_origen: "confirmacion",
        fecha_contable: fechaContable, glosa: `Compra ${compra.numero_control}`,
        moneda: d.moneda === "USD" ? "USD" : "PYG", tipo_cambio: d.tipo_cambio ?? 1,
        lineas: lineasAsiento, createdBy: d.created_by,
      });
      await client.query(
        `UPDATE ${tC} SET estado_contable='contabilizado', asiento_contable_id=$3::uuid
          WHERE id=$1::uuid AND empresa_id=$2::uuid`,
        [compra.id, empresaId, asiento.id]
      );
    }

    // ── Estados aguas arriba (recepciones y orden) ──
    for (const recepcionId of recepcionesTocadas) {
      await recalcularFacturacionRecepcionEnTx(client, schema, empresaId, recepcionId);
    }
    for (const ordenId of ordenesTocadas) {
      await recalcularEstadoOrdenEnTx(client, schema, empresaId, ordenId);
    }

    // Al editar, el stock puede haber bajado por ventas: la compra corregida
    // no puede dejar ningún producto en negativo.
    if (opts.reemplazaCompraId) {
      const neg = await client.query<{ nombre: string; stock_actual: string }>(
        `SELECT nombre, stock_actual::text FROM ${tP}
          WHERE empresa_id = $1::uuid AND stock_actual < 0
            AND id IN (SELECT producto_id FROM ${tCI} WHERE empresa_id = $1::uuid AND compra_id = ANY($2::uuid[]))`,
        [empresaId, [compra.id, opts.reemplazaCompraId]]
      );
      if (neg.rows.length > 0) {
        throw new ContabilidadError(
          `No se puede: ya se vendió parte de ${neg.rows.map((r) => r.nombre).join(", ")} y la compra corregida dejaría el stock en negativo.`,
          409
        );
      }
    }

    await client.query("COMMIT");
    return { compra, movimiento_id: movimientoId, movimiento_warning: null };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => null);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Compatibilidad: alta de compra directa monoproducto. Delega en la versión
 * multilínea con una sola línea (mismo comportamiento de Fase 0).
 */
export async function insertCompraConImpacto(
  schemaRaw: string,
  empresaId: string,
  d: InsertCompraInput
): Promise<CompraResult> {
  if (!d.cuenta_contable_id) {
    throw new ContabilidadError("La compra requiere una cuenta contable para contabilizarse.");
  }
  const iva: IvaTipo = d.iva_tipo === "5" ? "5" : d.iva_tipo === "10" ? "10" : "exenta";
  return insertCompraMultilinea(schemaRaw, empresaId, {
    proveedor_id: d.proveedor_id,
    proveedor_nombre: d.proveedor_nombre,
    orden_compra_id: null,
    origen_compra: "directa",
    moneda: d.moneda,
    tipo_cambio: d.tipo_cambio,
    tipo_pago: d.tipo_pago,
    plazo_dias: d.plazo_dias,
    cuotas: d.cuotas ?? null,
    nro_timbrado: d.nro_timbrado,
    numero_comprobante: d.numero_comprobante ?? null,
    tipo_comprobante: d.tipo_comprobante ?? null,
    cuenta_contrapartida_id: d.cuenta_contrapartida_id,
    items: [{
      producto_id: d.producto_id,
      producto_nombre: d.producto_nombre,
      descripcion: d.producto_nombre,
      cantidad: d.cantidad,
      costo_unitario: d.costo_unitario,
      iva_tipo: iva,
      cuenta_contable_id: d.cuenta_contable_id,
      recepcion_item_id: null,
      precio_venta: d.precio_venta,
      margen_venta: d.margen_venta,
    }],
    idempotency_key: d.idempotency_key,
    created_by: d.created_by,
    usuario_nombre: d.usuario_nombre,
  });
}

/** Lee una compra por id (para validar ownership antes de tocar su documento). */
export async function getCompraById(
  schemaRaw: string,
  empresaId: string,
  compraId: string
): Promise<CompraRow | null> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tC = quoteSchemaTable(schema, "compras");
  const { rows } = await pool().query<CompraRow>(
    `SELECT ${COLS} FROM ${tC} WHERE id = $1::uuid AND empresa_id = $2::uuid LIMIT 1`,
    [compraId, empresaId]
  );
  return rows[0] ?? null;
}

/** Asocia (o desasocia con null) el documento adjunto de la compra. */
export async function updateCompraDocumento(
  schemaRaw: string,
  empresaId: string,
  compraId: string,
  documentoPath: string | null,
  documentoMime: string | null
): Promise<CompraRow | null> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tC = quoteSchemaTable(schema, "compras");
  const { rows } = await pool().query<CompraRow>(
    `UPDATE ${tC} SET documento_path = $1, documento_mime = $2, updated_at = now()
      WHERE id = $3::uuid AND empresa_id = $4::uuid RETURNING ${COLS}`,
    [documentoPath, documentoMime, compraId, empresaId]
  );
  return rows[0] ?? null;
}

export interface CompraItemDetalle {
  producto_id: string | null;
  producto_nombre: string;
  cantidad: number;
  costo_unitario: number;
  iva_tipo: string | null;
  total_linea: number;
}

/**
 * Renglones de una compra y a dónde entró la mercadería: el camión (por la
 * ubicación de sus movimientos de inventario) o el salón.
 */
export async function getCompraDetalle(
  schemaRaw: string,
  empresaId: string,
  compraId: string
): Promise<{ items: CompraItemDetalle[]; destino: string; destino_camion_id: string | null }> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tCI = quoteSchemaTable(schema, "compra_items");
  const { rows } = await pool().query<{
    producto_id: string | null; producto_nombre: string | null; cantidad: string;
    costo_unitario: string; iva_tipo: string | null; total_linea: string;
  }>(
    `SELECT producto_id, producto_nombre, cantidad::text, costo_unitario::text, iva_tipo, total_linea::text
       FROM ${tCI} WHERE compra_id = $1::uuid AND empresa_id = $2::uuid
      ORDER BY orden_linea NULLS LAST, created_at`,
    [compraId, empresaId]
  );
  const items = rows.map((r) => ({
    producto_id: r.producto_id,
    producto_nombre: r.producto_nombre ?? "",
    cantidad: Number(r.cantidad),
    costo_unitario: Number(r.costo_unitario),
    iva_tipo: r.iva_tipo,
    total_linea: Number(r.total_linea),
  }));

  let destino = "Salón";
  let destinoCamionId: string | null = null;
  try {
    const d = await pool().query<{ alias: string; id: string }>(
      `SELECT c.alias, c.id
         FROM ${quoteSchemaTable(schema, "movimientos_inventario")} m
         JOIN ${quoteSchemaTable(schema, "camiones")} c ON c.ubicacion_id = m.ubicacion_id
        WHERE m.empresa_id = $1::uuid AND m.documento_tipo = 'compra' AND m.documento_id = $2::uuid
        LIMIT 1`,
      [empresaId, compraId]
    );
    if (d.rows[0]) {
      destino = `Camión ${d.rows[0].alias}`;
      destinoCamionId = d.rows[0].id;
    }
  } catch {
    // Sin camiones o sin ubicación en los movimientos: queda "Salón".
  }
  return { items, destino, destino_camion_id: destinoCamionId };
}

/**
 * Anula una compra directa dentro de una transacción abierta:
 *  - devuelve el stock que entró (total de la empresa y, si fue a un camión,
 *    el del camión), con un movimiento SALIDA origen 'anulacion';
 *  - si la compra tenía asiento, lo revierte con un contraasiento;
 *  - la marca `anulada` (sale de Cuentas por pagar y del Libro de compras).
 * No anula una compra que ya se vendió (dejaría stock negativo), salvo al
 * editar, donde se controla el resultado final.
 */
export async function anularCompraEnTx(
  client: import("pg").PoolClient,
  schemaRaw: string,
  empresaId: string,
  compraId: string,
  o: { usuario: string | null; createdBy: string | null; permitirNegativo?: boolean }
): Promise<void> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const tC = quoteSchemaTable(schema, "compras");
  const tM = quoteSchemaTable(schema, "movimientos_inventario");
  const tP = quoteSchemaTable(schema, "productos");
  const tSU = quoteSchemaTable(schema, "inventario_stock_ubicacion");

  const { rows: cab } = await client.query<{
    estado: string | null; origen_compra: string | null; numero_control: string; asiento_contable_id: string | null;
  }>(
    `SELECT estado, origen_compra, numero_control, asiento_contable_id
       FROM ${tC} WHERE id = $1::uuid AND empresa_id = $2::uuid FOR UPDATE`,
    [compraId, empresaId]
  );
  const c = cab[0];
  if (!c) throw new ContabilidadError("La compra no existe.", 404);
  if (c.estado === "anulada") throw new ContabilidadError("La compra ya está anulada.", 409);
  if (c.origen_compra === "recepcion") {
    throw new ContabilidadError("Esta compra viene de una recepción: se corrige desde Recepciones.", 409);
  }

  const { rows: movs } = await client.query<{
    producto_id: string; producto_nombre: string | null; producto_sku: string | null; cantidad: string;
    costo_unitario: string | null; ubicacion_id: string | null;
  }>(
    `SELECT producto_id, producto_nombre, producto_sku, cantidad::text, costo_unitario::text,
            ${await tieneUbicacion(client, schema) ? "ubicacion_id" : "NULL::uuid AS ubicacion_id"}
       FROM ${tM}
      WHERE empresa_id = $1::uuid AND documento_tipo = 'compra' AND documento_id = $2::uuid AND tipo = 'ENTRADA'`,
    [empresaId, compraId]
  );

  for (const m of movs) {
    const cant = Number(m.cantidad);
    if (!(cant > 0)) continue;
    if (!o.permitirNegativo) {
      const { rows: st } = await client.query<{ nombre: string; total: string; ubic: string | null }>(
        `SELECT p.nombre, p.stock_actual::text AS total,
                ${m.ubicacion_id ? `(SELECT su.stock_actual::text FROM ${tSU} su WHERE su.empresa_id = $1::uuid AND su.producto_id = p.id AND su.ubicacion_id = $3::uuid)` : "NULL::text"} AS ubic
           FROM ${tP} p WHERE p.id = $2::uuid AND p.empresa_id = $1::uuid FOR UPDATE`,
        m.ubicacion_id ? [empresaId, m.producto_id, m.ubicacion_id] : [empresaId, m.producto_id]
      );
      const hay = m.ubicacion_id ? Number(st[0]?.ubic ?? 0) : Number(st[0]?.total ?? 0);
      if (hay + 1e-9 < cant) {
        throw new ContabilidadError(
          `No se puede anular: de "${st[0]?.nombre ?? m.producto_nombre}" la compra cargó ${cant} y ${m.ubicacion_id ? "en el camión " : ""}quedan ${hay} (ya se vendió).`,
          409
        );
      }
    }
    await client.query(
      `UPDATE ${tP} SET stock_actual = COALESCE(stock_actual, 0) - $1::numeric, updated_at = now()
        WHERE id = $2::uuid AND empresa_id = $3::uuid`,
      [cant, m.producto_id, empresaId]
    );
    if (m.ubicacion_id) {
      await client.query(
        `UPDATE ${tSU} SET stock_actual = stock_actual - $1::numeric, updated_at = now()
          WHERE empresa_id = $2::uuid AND producto_id = $3::uuid AND ubicacion_id = $4::uuid`,
        [cant, empresaId, m.producto_id, m.ubicacion_id]
      );
    }
    await client.query(
      `INSERT INTO ${tM} (empresa_id, producto_id, producto_nombre, producto_sku, tipo, cantidad, costo_unitario,
         origen, referencia, fecha, created_by, usuario_nombre, documento_tipo, documento_id
         ${m.ubicacion_id ? ", ubicacion_id" : ""})
       VALUES ($1::uuid, $2::uuid, $3, $4, 'SALIDA', $5::numeric, $6::numeric, 'anulacion', $7, now(), $8::uuid, $9,
               'compra', $10::uuid ${m.ubicacion_id ? ", $11::uuid" : ""})`,
      [empresaId, m.producto_id, m.producto_nombre, m.producto_sku ?? "", cant, Number(m.costo_unitario ?? 0),
       `Anulación ${c.numero_control}`, o.createdBy, o.usuario, compraId,
       ...(m.ubicacion_id ? [m.ubicacion_id] : [])]
    );
  }

  // Compra vieja con asiento: contraasiento (Debe ↔ Haber).
  if (c.asiento_contable_id) {
    const orig = await getAsientoConDetalles(client, schema, empresaId, c.asiento_contable_id);
    if (orig && orig.detalles.length >= 2) {
      const hoy = new Date();
      const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
      await generarAsientoEnTx(client, schema, empresaId, {
        origen_tipo: "reversion", origen_id: compraId, evento_origen: "anulacion",
        fecha_contable: fecha, glosa: `Anulación compra ${c.numero_control}`,
        moneda: orig.cabecera.moneda, tipo_cambio: Number(orig.cabecera.tipo_cambio) || 1,
        lineas: orig.detalles.map((l) => ({ ...l, debe: Number(l.haber) || 0, haber: Number(l.debe) || 0 })),
        createdBy: o.createdBy, asiento_original_id: c.asiento_contable_id,
      });
    }
  }

  await client.query(
    `UPDATE ${tC} SET estado = 'anulada', updated_at = now() WHERE id = $1::uuid AND empresa_id = $2::uuid`,
    [compraId, empresaId]
  );
}

async function tieneUbicacion(client: import("pg").PoolClient, schema: string): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'movimientos_inventario' AND column_name = 'ubicacion_id'`,
    [schema]
  );
  return rows.length > 0;
}

/** Anular una compra (transacción propia). */
export async function anularCompra(
  schemaRaw: string,
  empresaId: string,
  compraId: string,
  o: { usuario: string | null; createdBy: string | null }
): Promise<void> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await anularCompraEnTx(client, schemaRaw, empresaId, compraId, o);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null);
    throw e;
  } finally {
    client.release();
  }
}
