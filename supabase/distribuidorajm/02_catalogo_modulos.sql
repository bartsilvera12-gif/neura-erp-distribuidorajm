-- =============================================================================
-- 02 · CATÁLOGO DE MÓDULOS  <schema_origen>.modulos → distribuidorajmerp.modulos
-- =============================================================================
-- `modulos` es catálogo DE PRODUCTO (la lista de módulos que existen en el ERP),
-- no datos de negocio: sin estas filas el sidebar no puede resolver permisos.
-- Copia SOLO esa tabla. No copia empresas, usuarios ni ninguna tabla de negocio.
--
-- Ajustar v_src si el origen no es 'zentra_erp'.
-- Es idempotente: se puede volver a correr (ON CONFLICT DO NOTHING).
-- =============================================================================

DO $seed$
DECLARE
  v_src text := 'zentra_erp';           -- <<<<<< AJUSTAR
  v_tgt text := 'distribuidorajmerp';
  v_cols text;
  v_n int;
BEGIN
  PERFORM set_config('search_path', 'pg_catalog', true);

  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
  INTO v_cols
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = v_tgt AND c.relname = 'modulos' AND a.attnum > 0 AND NOT a.attisdropped
    -- solo columnas que también existen en el origen
    AND EXISTS (
      SELECT 1 FROM pg_attribute a2
      JOIN pg_class c2 ON c2.oid = a2.attrelid
      JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
      WHERE n2.nspname = v_src AND c2.relname = 'modulos'
        AND a2.attname = a.attname AND a2.attnum > 0 AND NOT a2.attisdropped
    );

  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'no se encontró la tabla modulos en % o %', v_src, v_tgt;
  END IF;

  EXECUTE format(
    'INSERT INTO %I.modulos (%s) SELECT %s FROM %I.modulos ON CONFLICT DO NOTHING',
    v_tgt, v_cols, v_cols, v_src
  );

  EXECUTE format('SELECT count(*) FROM %I.modulos', v_tgt) INTO v_n;
  RAISE NOTICE 'catálogo: % módulos en %', v_n, v_tgt;
END;
$seed$;

-- Listado resultante (para confirmar los slugs disponibles):
SELECT slug, nombre FROM distribuidorajmerp.modulos ORDER BY slug;
