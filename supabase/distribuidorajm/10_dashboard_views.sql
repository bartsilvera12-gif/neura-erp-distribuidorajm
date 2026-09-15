-- =============================================================================
-- 10 · CATÁLOGO DE VISTAS DEL DASHBOARD  instemaq → distribuidorajmerp
-- =============================================================================
-- El Dashboard dice "No hay vistas del tablero disponibles para tu usuario"
-- porque la tabla `dashboard_views` quedó vacía: el 01 clonó la estructura sin
-- datos y el 02 copió solo `modulos`.
--
-- `dashboard_views` es catálogo DE PRODUCTO, igual que `modulos`: la lista de
-- pestañas que el ERP sabe dibujar (comercial, financiero, inventario, ventas…).
-- Sin esas filas no hay nada que mostrar, por más permisos que tenga el usuario.
--
-- No hace falta tocar `empresa_dashboard_views`: cuando está vacío el ERP asume
-- "todas las del catálogo" (ver resolve-effective-dashboard-views.ts), que es
-- justo lo que queremos para el admin de la empresa.
--
-- Copia SOLO esa tabla. Idempotente.
-- =============================================================================

DO $seed$
DECLARE
  v_src text := 'instemaq';
  v_tgt text := 'distribuidorajmerp';
  v_cols text;
  v_n int;
BEGIN
  PERFORM set_config('search_path', 'pg_catalog', true);

  IF to_regclass(v_tgt || '.dashboard_views') IS NULL THEN
    RAISE EXCEPTION 'no existe %.dashboard_views', v_tgt;
  END IF;
  IF to_regclass(v_src || '.dashboard_views') IS NULL THEN
    RAISE EXCEPTION 'no existe %.dashboard_views', v_src;
  END IF;

  -- Solo las columnas que existen en los dos lados: si el origen tiene alguna
  -- que el destino no, copiarla fallaría.
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
  INTO v_cols
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = v_tgt AND c.relname = 'dashboard_views'
    AND a.attnum > 0 AND NOT a.attisdropped
    AND EXISTS (
      SELECT 1 FROM pg_attribute a2
      JOIN pg_class c2 ON c2.oid = a2.attrelid
      JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
      WHERE n2.nspname = v_src AND c2.relname = 'dashboard_views'
        AND a2.attname = a.attname AND a2.attnum > 0 AND NOT a2.attisdropped
    );

  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'no hay columnas en común entre %.dashboard_views y %.dashboard_views',
      v_src, v_tgt;
  END IF;

  EXECUTE format(
    'INSERT INTO %I.dashboard_views (%s) SELECT %s FROM %I.dashboard_views ON CONFLICT DO NOTHING',
    v_tgt, v_cols, v_cols, v_src
  );

  EXECUTE format('SELECT count(*) FROM %I.dashboard_views', v_tgt) INTO v_n;
  RAISE NOTICE 'dashboard_views en %: % filas', v_tgt, v_n;
END;
$seed$;

-- Qué quedó: si `activo` viene en false, la vista no se ofrece.
SELECT slug, nombre, orden, activo
  FROM distribuidorajmerp.dashboard_views
 ORDER BY orden, slug;

SELECT pg_notify('pgrst', 'reload schema');
