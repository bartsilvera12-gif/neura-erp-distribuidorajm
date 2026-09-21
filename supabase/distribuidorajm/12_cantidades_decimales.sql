-- ============================================================================
-- 12. Cantidades decimales para productos pesables
-- ============================================================================
--
-- Un producto en KG se vende por lo que marca la balanza: 1,350 KG. Si la
-- columna de cantidad es `integer`, Postgres redondea sin avisar y esa venta
-- queda registrada como 1 KG. El cliente se lleva 350 gramos que el stock nunca
-- descontó y el control de mercadería los va a ver como merma todos los días.
--
-- Este script convierte a `numeric` las columnas de cantidad que hoy sean
-- enteras. Es idempotente: las que ya son numeric las deja como están, y
-- vuelve a correrse sin efecto. No toca precios ni montos.
--
-- `numeric` sin precisión (no `numeric(10,3)`) a propósito: no impone un tope
-- de dígitos, así que ninguna carga grande va a ser rechazada más adelante.
--
-- Sólo toca el schema `distribuidorajmerp`.
-- ============================================================================

DO $$
DECLARE
  v_schema  text := 'distribuidorajmerp';
  v_objetivo text[][] := ARRAY[
    ['productos',                   'stock_actual'],
    ['productos',                   'stock_minimo'],
    ['ventas_items',                'cantidad'],
    ['movimientos_inventario',      'cantidad'],
    ['inventario_stock_ubicacion',  'stock_actual'],
    ['productos_stock_ubicacion',   'stock_actual'],
    ['compras_items',               'cantidad'],
    ['reparto_stock',               'cantidad_inicial'],
    ['reparto_stock',               'cantidad_cargada'],
    ['reparto_stock',               'cantidad_vendida'],
    ['reparto_stock',               'cantidad_devuelta'],
    ['reparto_stock',               'cantidad_contada'],
    ['camion_objetivos',            'cantidad_objetivo']
  ];
  v_tabla   text;
  v_columna text;
  v_tipo    text;
  v_convertidas int := 0;
  i int;
BEGIN
  FOR i IN 1 .. array_length(v_objetivo, 1) LOOP
    v_tabla   := v_objetivo[i][1];
    v_columna := v_objetivo[i][2];

    SELECT data_type INTO v_tipo
      FROM information_schema.columns
     WHERE table_schema = v_schema
       AND table_name   = v_tabla
       AND column_name  = v_columna;

    -- La tabla o la columna puede no existir en este schema: no todas las
    -- funciones del ERP están instaladas, y eso no es un error.
    IF v_tipo IS NULL THEN
      RAISE NOTICE 'omitido  %.% (no existe)', v_tabla, v_columna;
      CONTINUE;
    END IF;

    IF v_tipo IN ('integer', 'bigint', 'smallint') THEN
      EXECUTE format(
        'ALTER TABLE %I.%I ALTER COLUMN %I TYPE numeric USING %I::numeric',
        v_schema, v_tabla, v_columna, v_columna
      );
      v_convertidas := v_convertidas + 1;
      RAISE NOTICE 'convertido %.% : % -> numeric', v_tabla, v_columna, v_tipo;
    ELSE
      RAISE NOTICE 'ya estaba %.% : %', v_tabla, v_columna, v_tipo;
    END IF;
  END LOOP;

  RAISE NOTICE '--- % columnas convertidas a numeric', v_convertidas;
END $$;

-- Verificación: todas tienen que decir `numeric`.
SELECT table_name  AS tabla,
       column_name AS columna,
       data_type   AS tipo
  FROM information_schema.columns
 WHERE table_schema = 'distribuidorajmerp'
   AND (
     (table_name = 'productos'                  AND column_name IN ('stock_actual','stock_minimo')) OR
     (table_name = 'ventas_items'               AND column_name = 'cantidad')                       OR
     (table_name = 'movimientos_inventario'     AND column_name = 'cantidad')                       OR
     (table_name = 'inventario_stock_ubicacion' AND column_name = 'stock_actual')                   OR
     (table_name = 'productos_stock_ubicacion'  AND column_name = 'stock_actual')                   OR
     (table_name = 'compras_items'              AND column_name = 'cantidad')                       OR
     (table_name = 'reparto_stock'              AND column_name LIKE 'cantidad%')                   OR
     (table_name = 'camion_objetivos'           AND column_name = 'cantidad_objetivo')
   )
 ORDER BY tabla, columna;
