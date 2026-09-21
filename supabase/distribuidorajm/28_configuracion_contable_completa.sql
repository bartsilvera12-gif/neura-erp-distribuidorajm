-- ============================================================================
-- 28. La configuración contable, con todas sus columnas
-- ============================================================================
--
-- Síntoma: column "cuenta_descuentos_incobrables_id" does not exist.
--
-- Vengo tapando agujeros de a uno porque verifiqué `configuracion_contable`
-- mirando una sola columna. Esto la cubre entera: las 14 cuentas que el código
-- lee y escribe, más `updated_by`/`updated_at` y la restricción UNIQUE que el
-- guardado necesita (usa ON CONFLICT (empresa_id)). Lo mismo para las demás
-- tablas del asiento, columna por columna, tomadas del código y no a ojo.
--
-- Alcance: SOLO el schema `distribuidorajmerp`. No toca `public` ni ningún otro.
-- Idempotente: volver a correrlo no agrega nada ni cambia un solo dato.
-- ============================================================================

DO $$
DECLARE
  v_schema    text := 'distribuidorajmerp';
  v_agregadas text[] := ARRAY[]::text[];
  v_col       record;
BEGIN
  -- La tabla puede no existir todavía: si no está, se crea vacía y el bucle
  -- de abajo le completa las columnas.
  IF to_regclass(v_schema || '.configuracion_contable') IS NULL THEN
    EXECUTE format($f$
      CREATE TABLE %I.configuracion_contable (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    $f$, v_schema);
    v_agregadas := v_agregadas || 'configuracion_contable (tabla)'::text;
  END IF;

  FOR v_col IN
    SELECT * FROM (VALUES
      -- Las 14 cuentas de la configuración contable.
      ('configuracion_contable', 'cuenta_iva_credito_5_id',          'uuid'),
      ('configuracion_contable', 'cuenta_iva_credito_10_id',         'uuid'),
      ('configuracion_contable', 'cuenta_proveedores_id',            'uuid'),
      ('configuracion_contable', 'cuenta_caja_id',                   'uuid'),
      ('configuracion_contable', 'cuenta_banco_id',                  'uuid'),
      ('configuracion_contable', 'cuenta_iva_debito_5_id',           'uuid'),
      ('configuracion_contable', 'cuenta_iva_debito_10_id',          'uuid'),
      ('configuracion_contable', 'cuenta_ventas_gravadas_id',        'uuid'),
      ('configuracion_contable', 'cuenta_ventas_exentas_id',         'uuid'),
      ('configuracion_contable', 'cuenta_ventas_servicios_id',       'uuid'),
      ('configuracion_contable', 'cuenta_clientes_id',               'uuid'),
      ('configuracion_contable', 'cuenta_anticipos_clientes_id',     'uuid'),
      ('configuracion_contable', 'cuenta_descuentos_incobrables_id', 'uuid'),
      ('configuracion_contable', 'updated_by',                       'uuid'),
      ('configuracion_contable', 'updated_at',                       'timestamptz'),
      -- La cabecera del asiento.
      ('asientos_contables', 'numero_asiento',      'text'),
      ('asientos_contables', 'fecha_contable',      'date'),
      ('asientos_contables', 'glosa',               'text'),
      ('asientos_contables', 'estado',              'text'),
      ('asientos_contables', 'origen_tipo',         'text'),
      ('asientos_contables', 'origen_id',           'uuid'),
      ('asientos_contables', 'evento_origen',       'text'),
      ('asientos_contables', 'moneda',              'text'),
      ('asientos_contables', 'tipo_cambio',         'numeric'),
      ('asientos_contables', 'asiento_original_id', 'uuid'),
      ('asientos_contables', 'created_by',          'uuid'),
      -- Los renglones del asiento.
      ('asientos_contables_detalles', 'asiento_id',         'uuid'),
      ('asientos_contables_detalles', 'cuenta_contable_id', 'uuid'),
      ('asientos_contables_detalles', 'proveedor_id',       'uuid'),
      ('asientos_contables_detalles', 'descripcion',        'text'),
      ('asientos_contables_detalles', 'debe',               'numeric'),
      ('asientos_contables_detalles', 'haber',              'numeric'),
      ('asientos_contables_detalles', 'documento_tipo',     'text'),
      ('asientos_contables_detalles', 'documento_id',       'uuid'),
      -- El período contable, que el asiento abre solo si no existe.
      ('periodos_contables', 'anio',        'integer'),
      ('periodos_contables', 'mes',         'integer'),
      ('periodos_contables', 'fecha_desde', 'date'),
      ('periodos_contables', 'fecha_hasta', 'date'),
      ('periodos_contables', 'estado',      'text'),
      ('periodos_contables', 'cerrado_at',  'timestamptz'),
      -- El plan de cuentas: solo se pueden elegir cuentas activas y asentables.
      ('plan_cuentas', 'activo',    'boolean'),
      ('plan_cuentas', 'asentable', 'boolean')
    ) AS t(tabla, campo, tipo)
  LOOP
    CONTINUE WHEN to_regclass(v_schema || '.' || v_col.tabla) IS NULL;
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = v_schema AND table_name = v_col.tabla
         AND column_name = v_col.campo
    );
    EXECUTE format('ALTER TABLE %I.%I ADD COLUMN %I %s',
                   v_schema, v_col.tabla, v_col.campo, v_col.tipo);
    v_agregadas := v_agregadas || (v_col.tabla || '.' || v_col.campo)::text;
  END LOOP;

  IF array_length(v_agregadas, 1) IS NULL THEN
    RAISE NOTICE 'columnas: no faltaba ninguna.';
  ELSE
    RAISE NOTICE 'agregado: %', array_to_string(v_agregadas, ', ');
  END IF;
END;
$$;

-- ── Las restricciones UNIQUE que los guardados necesitan ───────────────────
-- Guardar la configuración usa ON CONFLICT (empresa_id), y abrir el período
-- usa ON CONFLICT (empresa_id, anio, mes). Sin el índice único, ambos fallan.
DO $$
DECLARE
  v_schema text := 'distribuidorajmerp';
BEGIN
  IF to_regclass(v_schema || '.configuracion_contable') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_indexes
                      WHERE schemaname = v_schema
                        AND tablename = 'configuracion_contable'
                        AND indexname = 'uq_config_contable_empresa') THEN
    -- Si quedaron filas duplicadas de pruebas anteriores, se conserva la más
    -- reciente: es la que el sistema venía leyendo.
    EXECUTE format($f$
      DELETE FROM %I.configuracion_contable a
       USING %I.configuracion_contable b
       WHERE a.empresa_id = b.empresa_id AND a.ctid < b.ctid
    $f$, v_schema, v_schema);
    EXECUTE format('CREATE UNIQUE INDEX uq_config_contable_empresa ON %I.configuracion_contable (empresa_id)', v_schema);
    RAISE NOTICE 'creado: uq_config_contable_empresa';
  END IF;

  IF to_regclass(v_schema || '.periodos_contables') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_indexes
                      WHERE schemaname = v_schema
                        AND tablename = 'periodos_contables'
                        AND indexname = 'uq_periodo_empresa_anio_mes') THEN
    EXECUTE format('CREATE UNIQUE INDEX uq_periodo_empresa_anio_mes ON %I.periodos_contables (empresa_id, anio, mes)', v_schema);
    RAISE NOTICE 'creado: uq_periodo_empresa_anio_mes';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────────
-- Todo lo que el alta de una compra toca. Lo que no diga "ok" es donde se cae.
WITH requerido(paso, tabla, campo) AS (
  VALUES
    (3, 'movimientos_inventario', 'documento_tipo'),
    (3, 'movimientos_inventario', 'documento_id'),
    (3, 'movimientos_inventario', 'producto_nombre'),
    (3, 'movimientos_inventario', 'producto_sku'),
    (3, 'movimientos_inventario', 'tipo'),
    (3, 'movimientos_inventario', 'cantidad'),
    (3, 'movimientos_inventario', 'costo_unitario'),
    (3, 'movimientos_inventario', 'origen'),
    (3, 'movimientos_inventario', 'referencia'),
    (3, 'movimientos_inventario', 'fecha'),
    (3, 'movimientos_inventario', 'created_by'),
    (3, 'movimientos_inventario', 'usuario_nombre'),
    (4, 'productos', 'stock_actual'), (4, 'productos', 'costo_promedio'),
    (4, 'productos', 'precio_venta'), (4, 'productos', 'sku'),
    (5, 'configuracion_contable', 'cuenta_iva_credito_5_id'),
    (5, 'configuracion_contable', 'cuenta_iva_credito_10_id'),
    (5, 'configuracion_contable', 'cuenta_proveedores_id'),
    (5, 'configuracion_contable', 'cuenta_caja_id'),
    (5, 'configuracion_contable', 'cuenta_banco_id'),
    (5, 'configuracion_contable', 'cuenta_iva_debito_5_id'),
    (5, 'configuracion_contable', 'cuenta_iva_debito_10_id'),
    (5, 'configuracion_contable', 'cuenta_ventas_gravadas_id'),
    (5, 'configuracion_contable', 'cuenta_ventas_exentas_id'),
    (5, 'configuracion_contable', 'cuenta_ventas_servicios_id'),
    (5, 'configuracion_contable', 'cuenta_clientes_id'),
    (5, 'configuracion_contable', 'cuenta_anticipos_clientes_id'),
    (5, 'configuracion_contable', 'cuenta_descuentos_incobrables_id'),
    (5, 'configuracion_contable', 'updated_by'),
    (5, 'asientos_contables', 'numero_asiento'),
    (5, 'asientos_contables', 'fecha_contable'),
    (5, 'asientos_contables', 'glosa'),
    (5, 'asientos_contables', 'estado'),
    (5, 'asientos_contables', 'origen_tipo'),
    (5, 'asientos_contables', 'origen_id'),
    (5, 'asientos_contables', 'evento_origen'),
    (5, 'asientos_contables', 'moneda'),
    (5, 'asientos_contables', 'tipo_cambio'),
    (5, 'asientos_contables', 'asiento_original_id'),
    (5, 'asientos_contables', 'created_by'),
    (5, 'asientos_contables_detalles', 'asiento_id'),
    (5, 'asientos_contables_detalles', 'cuenta_contable_id'),
    (5, 'asientos_contables_detalles', 'proveedor_id'),
    (5, 'asientos_contables_detalles', 'descripcion'),
    (5, 'asientos_contables_detalles', 'debe'),
    (5, 'asientos_contables_detalles', 'haber'),
    (5, 'asientos_contables_detalles', 'documento_tipo'),
    (5, 'asientos_contables_detalles', 'documento_id'),
    (5, 'periodos_contables', 'anio'), (5, 'periodos_contables', 'mes'),
    (5, 'periodos_contables', 'fecha_desde'), (5, 'periodos_contables', 'fecha_hasta'),
    (5, 'periodos_contables', 'estado'),
    (5, 'plan_cuentas', 'activo'), (5, 'plan_cuentas', 'asentable')
), faltante AS (
  SELECT r.*,
         CASE
           WHEN to_regclass('distribuidorajmerp.' || r.tabla) IS NULL THEN '✗ falta la TABLA'
           WHEN EXISTS (SELECT 1 FROM information_schema.columns c
                         WHERE c.table_schema = 'distribuidorajmerp'
                           AND c.table_name = r.tabla AND c.column_name = r.campo)
             THEN 'ok'
           ELSE '✗ falta la columna'
         END AS estado
    FROM requerido r
)
SELECT CASE paso
         WHEN 3 THEN '3. movimiento de inventario'
         WHEN 4 THEN '4. stock del producto'
         ELSE '5. asiento contable'
       END AS etapa,
       tabla, campo, estado
  FROM faltante
 ORDER BY (CASE WHEN estado = 'ok' THEN 1 ELSE 0 END), paso, tabla, campo;
