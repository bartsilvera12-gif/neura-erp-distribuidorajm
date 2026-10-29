import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { aplicarDepositoEnTx } from "@/lib/cobranzas/server/recibos-pg";
import { quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { precioSegunLista, type ListaPrecio } from "@/lib/ventas/listas-precio";

export interface CreateVentaItemInput {
  producto_id: string;
  producto_nombre: string;
  sku: string;
  cantidad: number;
  precio_venta_original: number;
  precio_venta: number;
  tipo_iva: "EXENTA" | "5%" | "10%";
  subtotal: number;
  monto_iva: number;
  total_linea: number;
  /** Caja o paquete (SQL 57): `cantidad` son cajas y se descuentan cantidad × factor unidades. */
  empaque_id?: string | null;
}

export interface CreateVentaPgParams {
  schema: string;
  empresaId: string;
  clienteId: string | null;
  observaciones: string | null;
  moneda: "GS" | "USD";
  tipoCambio: number;
  tipoVenta: "CONTADO" | "CREDITO";
  plazoDias: number | null;
  /** Medio de cobro (`ventas.metodo_pago`). `null` en ventas a crédito. */
  metodoPago: "efectivo" | "tarjeta" | "transferencia" | "cheque" | "mixto" | null;
  /** Pago mixto: cuánto entró por cada medio. Tiene que sumar lo que se cobra. */
  pagosMixto?: { medio: "efectivo" | "transferencia" | "cheque"; monto: number }[] | null;
  /** Caja en la que se cobra. Obligatoria salvo venta a crédito. */
  cajaId: string | null;
  /** Reparto del que sale la mercadería. */
  repartoId: string | null;
  /**
   * Ubicación del camión de quien vende, cuando la venta no trae reparto: la
   * mercadería sale de ahí.
   */
  ubicacionId?: string | null;
  /**
   * Depósito del cliente (SQL 56) con el que se paga la venta: se usa su saldo
   * hasta el total, y a la caja entra solo la diferencia.
   */
  depositoId?: string | null;
  /** Lista de precio: minorista (precio de venta) o mayorista (−10%). */
  listaPrecio: ListaPrecio;
  items: CreateVentaItemInput[];
  /** Totales enviados por el cliente (se contrastan con el recálculo). */
  subtotalDeclarado: number;
  montoIvaDeclarado: number;
  totalDeclarado: number;
}

function qTable(schema: string, table: string): string {
  return quoteSchemaTable(schema, table);
}

function recalcTotals(items: CreateVentaItemInput[]) {
  let subtotal = 0;
  let montoIva = 0;
  let total = 0;
  for (const it of items) {
    subtotal += it.subtotal;
    montoIva += it.monto_iva;
    total += it.total_linea;
  }
  return { subtotal, montoIva, total };
}

const TOL = 2; // guaraníes — tolerancia de redondeo

/**
 * Crea venta + ítems + movimientos + descuenta stock en una transacción Postgres.
 * Requiere SUPABASE_DB_URL / DIRECT_URL / DATABASE_URL en el servidor.
 */
/** `true` si la tabla existe en el schema. */
async function tablaExiste(
  client: { query: (q: string, p?: unknown[]) => Promise<{ rows: { existe: string | null }[] }> },
  schema: string,
  tabla: string
): Promise<boolean> {
  const q = await client.query(`SELECT to_regclass($1)::text AS existe`, [`${schema}.${tabla}`]);
  return q.rows[0]?.existe !== null;
}

export async function createVentaTransaccionalPg(
  params: CreateVentaPgParams
): Promise<{ ventaId: string; numeroControl: string; fechaIso: string; depositoAplicado: number }> {
  const pool = getChatPostgresPool();
  if (!pool) {
    throw new Error("Sin conexión directa a Postgres (configura SUPABASE_DB_URL).");
  }

  const items = params.items;
  if (!items.length) {
    throw new Error("La venta debe tener al menos un ítem.");
  }

  const calc = recalcTotals(items);
  if (
    Math.abs(calc.subtotal - params.subtotalDeclarado) > TOL ||
    Math.abs(calc.montoIva - params.montoIvaDeclarado) > TOL ||
    Math.abs(calc.total - params.totalDeclarado) > TOL
  ) {
    throw new Error("Los totales no coinciden con los ítems; revisá el carrito.");
  }

  // Unidades que mueve cada línea: una caja mueve las que trae. Se completa
  // dentro de la transacción, cuando se leen las cajas.
  const factorDe = new Map<string, { factor: number; precio: number | null; nombre: string; producto_id: string }>();
  const unidadesDe = (it: CreateVentaItemInput) =>
    it.empaque_id ? it.cantidad * (factorDe.get(it.empaque_id)?.factor ?? 1) : it.cantidad;
  const qtyByProduct = new Map<string, number>();

  const ventasT = qTable(params.schema, "ventas");
  const itemsT = qTable(params.schema, "ventas_items");
  const movT = qTable(params.schema, "movimientos_inventario");
  const stockUbiT = qTable(params.schema, "inventario_stock_ubicacion");
  const prodT = qTable(params.schema, "productos");
  const cliT = qTable(params.schema, "clientes");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (params.clienteId) {
      const ck = await client.query<{ ok: number }>(
        `SELECT 1 AS ok FROM ${cliT} WHERE id = $1 AND empresa_id = $2 LIMIT 1`,
        [params.clienteId, params.empresaId]
      );
      if (ck.rows.length === 0) {
        throw new Error("Cliente no encontrado en esta empresa.");
      }
    }

    const empaqueIds = [...new Set(items.map((i) => i.empaque_id).filter((x): x is string => !!x))];
    if (empaqueIds.length > 0) {
      if (!(await tablaExiste(client, params.schema, "producto_empaques"))) {
        throw new Error("Falta correr el SQL 57 (cajas de productos).");
      }
      const emp = await client.query<{ id: string; producto_id: string; factor: string; precio_venta: string | null; nombre: string }>(
        `SELECT id, producto_id, factor::text AS factor, precio_venta::text AS precio_venta, nombre
           FROM ${qTable(params.schema, "producto_empaques")}
          WHERE empresa_id = $1::uuid AND id = ANY($2::uuid[])`,
        [params.empresaId, empaqueIds]
      );
      for (const e of emp.rows) {
        factorDe.set(e.id, {
          factor: Number(e.factor),
          precio: e.precio_venta === null ? null : Number(e.precio_venta),
          nombre: e.nombre,
          producto_id: e.producto_id,
        });
      }
      for (const it of items) {
        const e = it.empaque_id ? factorDe.get(it.empaque_id) : null;
        if (it.empaque_id && (!e || e.producto_id !== it.producto_id)) {
          throw new Error(`La caja de "${it.producto_nombre}" ya no existe. Recargá la caja.`);
        }
      }
    }
    for (const it of items) {
      qtyByProduct.set(it.producto_id, (qtyByProduct.get(it.producto_id) ?? 0) + unidadesDe(it));
    }

    const ids = [...qtyByProduct.keys()];
    const lockSql = `
      SELECT id, stock_actual, costo_promedio, nombre, sku, precio_venta
      FROM ${prodT}
      WHERE empresa_id = $1 AND id = ANY($2::uuid[])
      FOR UPDATE
    `;
    const locked = await client.query<{
      id: string;
      stock_actual: string;
      costo_promedio: string;
      nombre: string;
      sku: string;
      precio_venta: string | null;
    }>(lockSql, [params.empresaId, ids]);

    if (locked.rows.length !== ids.length) {
      throw new Error("Uno o más productos no existen o no pertenecen a esta empresa.");
    }

    /*
     * El precio de cada línea lo decide el catálogo, no la pantalla.
     *
     * Hasta acá solo se verificaba que las sumas cerraran entre sí, así que se
     * podía mandar cualquier precio. Con la lista mayorista eso importa más: el
     * descuento tiene que salir de acá, del precio de venta guardado, para que
     * nadie cobre "mayorista" a un precio que no es. La caja no permite editar
     * precios a mano, así que un precio distinto solo puede ser un catálogo que
     * cambió mientras la pantalla estaba abierta: se avisa para recargar.
     */
    const precioDb = new Map(locked.rows.map((r) => [r.id, Number(r.precio_venta ?? 0)]));
    for (const it of items) {
      const unidad = precioDb.get(it.producto_id) ?? 0;
      const caja = it.empaque_id ? factorDe.get(it.empaque_id) : null;
      // La caja tiene su precio; sin precio propio, vale sus unidades.
      const base = caja ? (caja.precio ?? Math.round(unidad * caja.factor)) : unidad;
      const esperado = precioSegunLista(base, params.listaPrecio);
      if (Math.abs(it.precio_venta - esperado) > 1) {
        throw new Error(
          `El precio de "${it.producto_nombre}" cambió (${params.listaPrecio}: Gs. ${esperado.toLocaleString("es-PY")}). Recargá la caja y volvé a cargar la venta.`
        );
      }
    }

    const stockMap = new Map<
      string,
      { stock: number; costo: number; nombre: string; sku: string }
    >();
    for (const row of locked.rows) {
      stockMap.set(row.id, {
        stock: Number(row.stock_actual),
        costo: Number(row.costo_promedio),
        nombre: row.nombre,
        sku: row.sku,
      });
    }

    for (const [pid, need] of qtyByProduct) {
      const p = stockMap.get(pid)!;
      if (p.stock < need) {
        throw new Error(
          `Stock insuficiente para "${p.nombre}". Disponible: ${p.stock} u.; requerido: ${need}.`
        );
      }
    }

    const maxRow = await client.query<{ mx: string | null }>(
      `
      SELECT COALESCE(MAX(
        CASE
          WHEN numero_control ~ '^VTA-[0-9]+$'
          THEN substring(numero_control from '[0-9]+$')::bigint
          ELSE NULL::bigint
        END
      ), 0)::text AS mx
      FROM ${ventasT}
      WHERE empresa_id = $1
      `,
      [params.empresaId]
    );
    const nextNum = BigInt(maxRow.rows[0]?.mx ?? "0") + BigInt(1);
    const numeroControl = `VTA-${String(nextNum).padStart(6, "0")}`;

    const fechaIso = new Date().toISOString();

    // Estas columnas pueden no existir en schemas viejos: se escriben solo si
    // están, para que cobrar no dependa de una migración pendiente.
    const colsQ = await client.query<{ columna: string }>(
      `
      SELECT column_name AS columna
        FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'ventas'
         AND column_name IN ('metodo_pago', 'caja_id', 'reparto_id', 'lista_precio')
      `,
      [params.schema]
    );
    const columnas = new Set(colsQ.rows.map((r) => r.columna));

    const extraCols: string[] = [];
    const extraVals: unknown[] = [];
    if (columnas.has("metodo_pago")) {
      extraCols.push("metodo_pago");
      extraVals.push(params.metodoPago);
    }
    if (columnas.has("caja_id")) {
      extraCols.push("caja_id");
      extraVals.push(params.cajaId);
    }
    if (columnas.has("reparto_id")) {
      extraCols.push("reparto_id");
      extraVals.push(params.repartoId);
    }
    // Opcional (migración 39): saber después qué ventas fueron mayoristas.
    if (columnas.has("lista_precio")) {
      extraCols.push("lista_precio");
      extraVals.push(params.listaPrecio);
    }
    // Los placeholders siguen después de los 12 fijos del INSERT.
    const extraPlaceholders = extraCols.map((_, i) => `$${13 + i}`);

    const insVenta = await client.query<{ id: string }>(
      `
      INSERT INTO ${ventasT} (
        empresa_id, cliente_id, numero_control, moneda, tipo_cambio,
        subtotal, monto_iva, total, estado, tipo_venta, plazo_dias, fecha, observaciones
        ${extraCols.length > 0 ? ", " + extraCols.join(", ") : ""}
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, 'completada', $9, $10, $11::timestamptz, $12
        ${extraPlaceholders.length > 0 ? ", " + extraPlaceholders.join(", ") : ""}
      )
      RETURNING id
      `,
      [
        params.empresaId,
        params.clienteId,
        numeroControl,
        params.moneda,
        params.tipoCambio,
        calc.subtotal,
        calc.montoIva,
        calc.total,
        params.tipoVenta,
        params.plazoDias,
        fechaIso,
        params.observaciones,
        ...extraVals,
      ]
    );

    const ventaId = insVenta.rows[0].id;

    // De qué camión sale la mercadería. El reparto apunta al camión y el camión
    // a su ubicación de inventario: la venta móvil descuenta de ESE stock y no
    // solo del global. Sin reparto es venta de mostrador y no hay ubicación.
    //
    // Todo esto es opcional: un schema sin la migración del stock móvil sigue
    // vendiendo igual, solo que sin registrar la ubicación. Cobrar no puede
    // depender de una migración pendiente.
    const movColsQ = await client.query<{ columna: string }>(
      `
      SELECT column_name AS columna
        FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'movimientos_inventario'
         AND column_name = 'ubicacion_id'
      `,
      [params.schema]
    );
    const movTieneUbicacion = movColsQ.rows.length > 0;
    const hayStockPorUbicacion = await tablaExiste(
      client,
      params.schema,
      "inventario_stock_ubicacion"
    );

    // De qué ubicación sale la mercadería: la del camión del reparto.
    //
    // Se resuelve con que haya reparto, y nada más. Antes también exigía que
    // `movimientos_inventario` tuviera columna `ubicacion_id` y que `ventas`
    // tuviera `reparto_id`: en un schema al que le faltara cualquiera de las
    // dos, la venta descontaba del stock general y el camión seguía con la
    // misma cantidad que antes de vender. Esas dos columnas deciden qué se
    // puede GUARDAR en cada tabla, no de dónde salió la mercadería.
    let ubicacionId: string | null = params.ubicacionId ?? null;
    if (params.repartoId !== null) {
      const camT = quoteSchemaTable(params.schema, "camiones");
      const repT = quoteSchemaTable(params.schema, "repartos");
      const ubiQ = await client.query<{ ubicacion_id: string | null }>(
        `SELECT c.ubicacion_id
           FROM ${repT} r JOIN ${camT} c ON c.id = r.camion_id
          WHERE r.id = $1::uuid AND r.empresa_id = $2::uuid`,
        [params.repartoId, params.empresaId]
      );
      ubicacionId = ubiQ.rows[0]?.ubicacion_id ?? null;
    }

    // Lo que no está arriba del camión no se puede vender desde el camión.
    //
    // El chequeo de más arriba mira el stock general de la empresa, que incluye
    // el depósito: sin esto, el vendedor podía cargar en la venta mercadería
    // que nunca subió al camión, y el control de mercadería del cierre le
    // aparecía como un faltante que no cometió.
    if (ubicacionId !== null && hayStockPorUbicacion) {
      const enCamion = await client.query<{ producto_id: string; stock_actual: string }>(
        `SELECT producto_id, stock_actual::text AS stock_actual
           FROM ${stockUbiT}
          WHERE empresa_id = $1::uuid AND ubicacion_id = $2::uuid
            AND producto_id = ANY($3::uuid[])`,
        [params.empresaId, ubicacionId, ids]
      );
      const arriba = new Map(enCamion.rows.map((r) => [r.producto_id, Number(r.stock_actual)]));
      for (const [pid, need] of qtyByProduct) {
        const hay = arriba.get(pid) ?? 0;
        if (hay < need) {
          const nombre = stockMap.get(pid)?.nombre ?? "ese producto";
          throw new Error(
            hay <= 0
              ? `"${nombre}" no está cargado en el camión. Cargalo con una compra a ese camión antes de venderlo.`
              : `El camión tiene ${hay} de "${nombre}" y la venta pide ${need}.`
          );
        }
      }
    } else if (
      ubicacionId === null &&
      hayStockPorUbicacion &&
      (await tablaExiste(client, params.schema, "inventario_ubicaciones"))
    ) {
      // Venta del salón: solo puede llevarse lo que está en el salón. Lo que
      // está arriba de los camiones es parte del total de la empresa pero no
      // está acá (salón = total − lo que tienen los camiones).
      const enCamiones = await client.query<{ producto_id: string; suma: string }>(
        // Misma cuenta que el catálogo de la caja (`/api/productos`).
        `SELECT su.producto_id, SUM(su.stock_actual)::text AS suma
           FROM ${stockUbiT} su
           JOIN ${quoteSchemaTable(params.schema, "inventario_ubicaciones")} u ON u.id = su.ubicacion_id
          WHERE su.empresa_id = $1::uuid AND su.producto_id = ANY($2::uuid[])
            AND lower(btrim(COALESCE(u.tipo, ''))) = 'camion'
          GROUP BY su.producto_id`,
        [params.empresaId, ids]
      );
      const fuera = new Map(enCamiones.rows.map((r) => [r.producto_id, Number(r.suma)]));
      for (const [pid, need] of qtyByProduct) {
        const enSalon = (stockMap.get(pid)?.stock ?? 0) - (fuera.get(pid) ?? 0);
        if (enSalon + 1e-9 < need) {
          const nombre = stockMap.get(pid)?.nombre ?? "ese producto";
          throw new Error(
            enSalon <= 0
              ? `"${nombre}" no tiene stock en el salón (lo que hay está en los camiones).`
              : `En el salón hay ${enSalon} de "${nombre}" y la venta pide ${need}.`
          );
        }
      }
    }

    // Pagada (en todo o en parte) con un depósito del cliente: esa parte ya
    // estaba anotada y no entra a la caja.
    const depositoAplicado =
      params.depositoId && params.tipoVenta === "CONTADO"
        ? await aplicarDepositoEnTx(client, params.schema, params.empresaId, {
            depositoId: params.depositoId,
            clienteId: params.clienteId,
            ventaId,
            total: calc.total,
          })
        : 0;
    const aCaja = calc.total - depositoAplicado;

    // Pago mixto: las partes tienen que sumar lo que se cobra, ni más ni menos.
    const mixto = params.metodoPago === "mixto" && params.tipoVenta === "CONTADO" ? (params.pagosMixto ?? []) : null;
    if (mixto) {
      const suma = mixto.reduce((s, p) => s + p.monto, 0);
      if (Math.abs(suma - aCaja) > TOL) {
        throw new Error(
          `El pago mixto suma Gs. ${Math.round(suma).toLocaleString("es-PY")} y hay que cobrar Gs. ${Math.round(aCaja).toLocaleString("es-PY")}.`
        );
      }
    }

    // Movimiento de caja del cobro. Solo para ventas de contado: una venta a
    // crédito no mete plata en la caja hoy, y registrarla descuadraría el arqueo.
    if (
      params.cajaId !== null &&
      params.tipoVenta === "CONTADO" &&
      params.metodoPago !== null &&
      aCaja > 0 &&
      (await tablaExiste(client, params.schema, "caja_movimientos"))
    ) {
      const movT = quoteSchemaTable(params.schema, "caja_movimientos");
      const concepto = depositoAplicado > 0 ? `Venta ${numeroControl} (resto del depósito)` : `Venta ${numeroControl}`;
      // Mixto: un movimiento por medio, así el arqueo sabe cuánto efectivo
      // hay en el cajón y cuánto entró por transferencia o en cheque.
      const partes =
        mixto && mixto.length > 0
          ? mixto.filter((p) => p.monto > 0).map((p) => ({ medio: p.medio as string, monto: p.monto, concepto: `${concepto} (mixto)` }))
          : [
              {
                // `caja_movimientos.medio_pago` no tiene `mixto`: su equivalente es `otro`.
                medio: params.metodoPago === "mixto" ? "otro" : params.metodoPago,
                monto: aCaja,
                concepto,
              },
            ];
      for (const parte of partes) {
        await client.query(
          `
          INSERT INTO ${movT} (empresa_id, caja_id, tipo, concepto, monto, medio_pago, venta_id)
          VALUES ($1::uuid, $2::uuid, 'ingreso', $3, $4, $5, $6::uuid)
          `,
          [params.empresaId, params.cajaId, parte.concepto, parte.monto, parte.medio, ventaId]
        );
      }
    }

    // Columnas de cajas en las líneas (SQL 57): se escriben si están.
    const itemColsQ = await client.query<{ columna: string }>(
      `SELECT column_name AS columna FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'ventas_items'
          AND column_name IN ('empaque_id', 'empaque_nombre', 'unidades')`,
      [params.schema]
    );
    const itemConCajas = itemColsQ.rows.length === 3;

    for (const line of items) {
      const p = stockMap.get(line.producto_id)!;
      const unidades = unidadesDe(line);
      const caja = line.empaque_id ? factorDe.get(line.empaque_id) : null;
      await client.query(
        `
        INSERT INTO ${itemsT} (
          empresa_id, venta_id, producto_id, producto_nombre, sku,
          cantidad, precio_venta_original, precio_venta, tipo_iva,
          subtotal, monto_iva, total_linea
          ${itemConCajas ? ", empaque_id, empaque_nombre, unidades" : ""}
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12
          ${itemConCajas ? ", $13::uuid, $14, $15" : ""}
        )
        `,
        [
          params.empresaId,
          ventaId,
          line.producto_id,
          line.producto_nombre,
          line.sku,
          line.cantidad,
          line.precio_venta_original,
          line.precio_venta,
          line.tipo_iva,
          line.subtotal,
          line.monto_iva,
          line.total_linea,
          ...(itemConCajas ? [line.empaque_id ?? null, caja?.nombre ?? null, unidades] : []),
        ]
      );

      const nuevoStock = p.stock - unidades;
      await client.query(
        `UPDATE ${prodT} SET stock_actual = $1 WHERE id = $2 AND empresa_id = $3`,
        [nuevoStock, line.producto_id, params.empresaId]
      );
      p.stock = nuevoStock;

      await client.query(
        `
        INSERT INTO ${movT} (
          empresa_id, producto_id, producto_nombre, producto_sku,
          tipo, cantidad, costo_unitario, origen, referencia, fecha, venta_id
          ${movTieneUbicacion ? ", ubicacion_id" : ""}
        ) VALUES (
          $1, $2, $3, $4,
          'SALIDA', $5, $6, 'venta', $7, $8::timestamptz, $9
          ${movTieneUbicacion ? ", $10::uuid" : ""}
        )
        `,
        [
          params.empresaId,
          line.producto_id,
          // El movimiento es en unidades: lleva el nombre del producto, no el de la caja.
          caja ? p.nombre : line.producto_nombre,
          line.sku,
          unidades,
          p.costo,
          numeroControl,
          fechaIso,
          ventaId,
          ...(movTieneUbicacion ? [ubicacionId] : []),
        ]
      );

      // Stock de la ubicación del camión. El total global lo sigue llevando
      // `productos.stock_actual` unas líneas más arriba: acá se registra en qué
      // ubicación dejó de estar la mercadería.
      if (ubicacionId !== null && hayStockPorUbicacion) {
        await client.query(
          `
          INSERT INTO ${stockUbiT} (empresa_id, producto_id, ubicacion_id, stock_actual)
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
          ON CONFLICT (empresa_id, producto_id, ubicacion_id)
          DO UPDATE SET stock_actual = ${stockUbiT}.stock_actual + EXCLUDED.stock_actual,
                        updated_at = now()
          `,
          [params.empresaId, line.producto_id, ubicacionId, -unidades]
        );
      }
    }

    // Acumulado de lo que salió del camión. Es un espejo: el control de
    // mercadería lo recalcula desde `ventas`, pero mantenerlo en caliente deja
    // el dato a mano sin recorrer las ventas del día.
    if (
      params.repartoId !== null &&
      columnas.has("reparto_id") &&
      (await tablaExiste(client, params.schema, "reparto_stock"))
    ) {
      const stockT = quoteSchemaTable(params.schema, "reparto_stock");
      for (const [productoId, cantidad] of qtyByProduct) {
        await client.query(
          `UPDATE ${stockT}
              SET cantidad_vendida = cantidad_vendida + $1, updated_at = now()
            WHERE reparto_id = $2::uuid AND producto_id = $3::uuid`,
          [cantidad, params.repartoId, productoId]
        );
      }
    }

    await client.query("COMMIT");
    return { ventaId, numeroControl, fechaIso, depositoAplicado };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
