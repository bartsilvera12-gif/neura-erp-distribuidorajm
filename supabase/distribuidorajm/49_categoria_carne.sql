-- =============================================================================
-- 49 · CATEGORÍA "CARNE"
-- =============================================================================
-- Crea la categoría Carne (si no existe) y se la pone como categoría principal
-- a los productos de carne y pollo, reconocidos por el nombre: ala, muslo,
-- pechuga, gallina, pollo, puchero, molida, carne, menudencia, etc.
--
-- PASO 1: corré solo el SELECT de abajo y mirá la lista. Si falta o sobra
--         alguno, ajustá las palabras de v_palabras (y del SELECT).
-- PASO 2: corré el bloque DO.
--
-- Solo toca `distribuidorajmerp`. Idempotente.
-- =============================================================================

-- PASO 1 · qué productos van a quedar en Carne
SELECT nombre, sku
  FROM distribuidorajmerp.productos
 WHERE empresa_id = '058efef5-e1b5-4cab-8a65-238f81823917'
   AND upper(nombre) ~ '(^|[^A-Z])(ALAS?|ALITAS?|MUSLOS?|PECHUGAS?|GALLINAS?|POLLOS?|PUCHERO|MOLIDA|CARNES?|MENUDENCIAS?|HIGADO|MOLLEJAS?|CORAZON|PATAS?|COSTILLAS?|CERDO|VACUNO|CHORIZOS?)([^A-Z]|$)'
 ORDER BY nombre;

-- PASO 2 · crear la categoría y asignarla
DO $carne$
DECLARE
  v_empresa_id uuid := '058efef5-e1b5-4cab-8a65-238f81823917';
  v_palabras   text := '(^|[^A-Z])(ALAS?|ALITAS?|MUSLOS?|PECHUGAS?|GALLINAS?|POLLOS?|PUCHERO|MOLIDA|CARNES?|MENUDENCIAS?|HIGADO|MOLLEJAS?|CORAZON|PATAS?|COSTILLAS?|CERDO|VACUNO|CHORIZOS?)([^A-Z]|$)';
  v_cat        uuid;
  v_n          int;
BEGIN
  SELECT id INTO v_cat
    FROM distribuidorajmerp.categorias_productos
   WHERE empresa_id = v_empresa_id AND lower(trim(nombre)) = 'carne'
   LIMIT 1;
  IF v_cat IS NULL THEN
    INSERT INTO distribuidorajmerp.categorias_productos (empresa_id, nombre, activo)
    VALUES (v_empresa_id, 'Carne', true)
    RETURNING id INTO v_cat;
    RAISE NOTICE 'categoría Carne creada';
  END IF;

  -- La principal de cada uno pasa a ser Carne (la anterior queda como
  -- secundaria, no se borra).
  UPDATE distribuidorajmerp.producto_categorias pc
     SET es_principal = false
    FROM distribuidorajmerp.productos p
   WHERE pc.producto_id = p.id AND p.empresa_id = v_empresa_id
     AND upper(p.nombre) ~ v_palabras
     AND pc.categoria_id <> v_cat AND pc.es_principal;

  INSERT INTO distribuidorajmerp.producto_categorias (empresa_id, producto_id, categoria_id, es_principal)
  SELECT v_empresa_id, p.id, v_cat, true
    FROM distribuidorajmerp.productos p
   WHERE p.empresa_id = v_empresa_id AND upper(p.nombre) ~ v_palabras
  ON CONFLICT (empresa_id, producto_id, categoria_id) DO UPDATE SET es_principal = true;

  UPDATE distribuidorajmerp.productos p
     SET categoria_principal_id = v_cat
   WHERE p.empresa_id = v_empresa_id AND upper(p.nombre) ~ v_palabras;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RAISE NOTICE 'productos en Carne: %', v_n;
  PERFORM pg_notify('pgrst', 'reload schema');
END;
$carne$;
