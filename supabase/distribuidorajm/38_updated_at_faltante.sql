-- ============================================================================
-- 38. `updated_at` en las tablas del circuito de compras
-- ============================================================================
--
-- Síntoma: column "updated_at" of relation "recepcion_items" does not exist,
-- al registrar la factura de una recepción.
--
-- Error mío: al crear `recepcion_items` en la migración 34 miré los INSERT del
-- código pero no sus UPDATE, y el paso de facturación hace
--   UPDATE recepcion_items SET cantidad_facturada = ..., updated_at = now()
--
-- Se agrega en las cuatro tablas del circuito, no solo en la que falló: todas
-- llevan la misma convención y cualquiera puede necesitarla.
--
-- Alcance: SOLO el schema `distribuidorajmerp`. No toca `public` ni ningún otro.
-- Idempotente: volver a correrlo no agrega nada ni cambia un solo dato.
-- ============================================================================

DO $$
DECLARE
  v_schema text := 'distribuidorajmerp';
  v_hechas text[] := ARRAY[]::text[];
  v_tabla  text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY['ordenes_compra','orden_compra_items','recepciones','recepcion_items']
  LOOP
    CONTINUE WHEN to_regclass(v_schema || '.' || v_tabla) IS NULL;
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = v_schema AND table_name = v_tabla
         AND column_name = 'updated_at'
    );
    EXECUTE format('ALTER TABLE %I.%I ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now()',
                   v_schema, v_tabla);
    v_hechas := v_hechas || (v_tabla || '.updated_at')::text;
  END LOOP;

  IF array_length(v_hechas, 1) IS NULL THEN
    RAISE NOTICE 'no faltaba ninguna.';
  ELSE
    RAISE NOTICE 'agregado: %', array_to_string(v_hechas, ', ');
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
SELECT t AS tabla,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = 'distribuidorajmerp' AND c.table_name = t
            AND c.column_name = 'updated_at'
       ) THEN 'ok' ELSE '✗ falta updated_at' END AS estado
  FROM unnest(ARRAY['ordenes_compra','orden_compra_items','recepciones','recepcion_items']) t
 ORDER BY 2, 1;
