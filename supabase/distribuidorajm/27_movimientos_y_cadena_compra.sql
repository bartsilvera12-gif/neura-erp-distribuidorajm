-- ============================================================================
-- 27. La cadena completa del alta de una compra
-- ============================================================================
--
-- Vengo destapando de a una: primero faltaban columnas en `compras` (25),
-- después las tablas de asientos (26), y la compra sigue sin guardarse. Esto
-- cubre lo que queda de la cadena y, sobre todo, la VERIFICA entera: al final
-- imprime cada tabla y columna que el alta toca, en orden, con su estado.
--
-- Guardar una compra hace, todo en una sola transacción:
--   1. INSERT en `compras`                      (migración 25)
--   2. INSERT en `compra_items`                 (migración 25)
--   3. INSERT en `movimientos_inventario`       ← esto
--   4. UPDATE  de `productos` (stock y costo)
--   5. INSERT del asiento contable              (migración 26)
-- Si cualquiera de los cinco falla, se deshace todo y no queda nada guardado.
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
  FOR v_col IN
    SELECT * FROM (VALUES
      -- El movimiento de inventario que genera la compra.
      ('movimientos_inventario', 'producto_nombre', 'text'),
      ('movimientos_inventario', 'producto_sku',    'text'),
      ('movimientos_inventario', 'tipo',            'text'),
      ('movimientos_inventario', 'cantidad',        'numeric'),
      ('movimientos_inventario', 'costo_unitario',  'numeric'),
      ('movimientos_inventario', 'origen',          'text'),
      ('movimientos_inventario', 'referencia',      'text'),
      ('movimientos_inventario', 'fecha',           'timestamptz'),
      ('movimientos_inventario', 'created_by',      'uuid'),
      ('movimientos_inventario', 'usuario_nombre',  'text'),
      ('movimientos_inventario', 'documento_tipo',  'text'),
      ('movimientos_inventario', 'documento_id',    'uuid'),
      ('movimientos_inventario', 'ubicacion_id',    'uuid'),
      -- El producto, que la compra actualiza.
      ('productos', 'stock_actual',   'numeric'),
      ('productos', 'costo_promedio', 'numeric'),
      ('productos', 'precio_venta',   'numeric'),
      ('productos', 'sku',            'text'),
      ('productos', 'updated_at',     'timestamptz')
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
    RAISE NOTICE 'columnas agregadas: %', array_to_string(v_agregadas, ', ');
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ── Verificación: los cinco pasos del alta, en orden ───────────────────────
-- Cualquier fila que no diga "ok" es el paso donde la compra se va a caer.
WITH requerido(paso, tabla, campo) AS (
  VALUES
    -- 1. cabecera
    (1, 'compras', 'numero_control'), (1, 'compras', 'proveedor_nombre'),
    (1, 'compras', 'producto_nombre'), (1, 'compras', 'moneda'),
    (1, 'compras', 'tipo_cambio'), (1, 'compras', 'iva_tipo'),
    (1, 'compras', 'subtotal'), (1, 'compras', 'monto_iva'),
    (1, 'compras', 'precio_venta'), (1, 'compras', 'margen_venta'),
    (1, 'compras', 'tipo_pago'), (1, 'compras', 'cuotas'),
    (1, 'compras', 'nro_timbrado'), (1, 'compras', 'cuenta_contable_id'),
    (1, 'compras', 'cuenta_contrapartida_id'), (1, 'compras', 'afecta_stock'),
    (1, 'compras', 'idempotency_key'), (1, 'compras', 'origen_compra'),
    (1, 'compras', 'orden_compra_id'), (1, 'compras', 'numero_comprobante'),
    (1, 'compras', 'tipo_comprobante'), (1, 'compras', 'usuario_nombre'),
    -- 2. renglones
    (2, 'compra_items', 'compra_id'), (2, 'compra_items', 'producto_nombre'),
    (2, 'compra_items', 'descripcion'), (2, 'compra_items', 'costo_unitario'),
    (2, 'compra_items', 'total_linea'), (2, 'compra_items', 'cuenta_contable_id'),
    (2, 'compra_items', 'afecta_inventario'), (2, 'compra_items', 'orden_linea'),
    -- 3. movimiento de inventario
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
    (3, 'movimientos_inventario', 'documento_tipo'),
    (3, 'movimientos_inventario', 'documento_id'),
    -- 4. producto
    (4, 'productos', 'stock_actual'), (4, 'productos', 'costo_promedio'),
    (4, 'productos', 'precio_venta'), (4, 'productos', 'sku'),
    -- 5. asiento contable
    (5, 'asientos_contables', 'numero_asiento'),
    (5, 'asientos_contables', 'fecha_contable'),
    (5, 'asientos_contables', 'origen_tipo'),
    (5, 'asientos_contables', 'evento_origen'),
    (5, 'asientos_contables_detalles', 'cuenta_contable_id'),
    (5, 'asientos_contables_detalles', 'debe'),
    (5, 'asientos_contables_detalles', 'haber'),
    (5, 'periodos_contables', 'fecha_desde'),
    (5, 'configuracion_contable', 'cuenta_proveedores_id'),
    (5, 'plan_cuentas', 'asentable')
)
SELECT r.paso,
       CASE r.paso
         WHEN 1 THEN '1. cabecera de la compra'
         WHEN 2 THEN '2. renglones'
         WHEN 3 THEN '3. movimiento de inventario'
         WHEN 4 THEN '4. stock del producto'
         ELSE '5. asiento contable'
       END AS etapa,
       r.tabla, r.campo,
       CASE
         WHEN to_regclass('distribuidorajmerp.' || r.tabla) IS NULL THEN '✗ falta la TABLA'
         WHEN EXISTS (SELECT 1 FROM information_schema.columns c
                       WHERE c.table_schema = 'distribuidorajmerp'
                         AND c.table_name = r.tabla AND c.column_name = r.campo)
           THEN 'ok'
         ELSE '✗ falta la columna'
       END AS estado
  FROM requerido r
 ORDER BY (CASE WHEN to_regclass('distribuidorajmerp.' || r.tabla) IS NULL
                  OR NOT EXISTS (SELECT 1 FROM information_schema.columns c
                                  WHERE c.table_schema = 'distribuidorajmerp'
                                    AND c.table_name = r.tabla AND c.column_name = r.campo)
                THEN 0 ELSE 1 END),
          r.paso, r.tabla, r.campo;
