-- ============================================================================
-- 33. Las cuentas propias de la empresa — "¿a dónde transfiero?"
-- ============================================================================
--
-- El modal de cobro pide banco de origen, titular y comprobante, pero nunca
-- dice a qué cuenta hay que transferir. Sin ese dato la opción no sirve: el
-- cliente no tiene adónde mandar la plata.
--
-- Se reusa el catálogo de `bancos` en vez de crear una tabla nueva: una fila
-- con `es_cuenta_propia = true` es una cuenta DE LA EMPRESA (a dónde cobrar),
-- y las demás siguen siendo entidades de ORIGEN (de dónde viene el pago).
--
-- Alcance: SOLO el schema `distribuidorajmerp`. No toca `public` ni ningún otro.
-- Idempotente: volver a correrlo no agrega nada ni cambia un solo dato.
-- ============================================================================

DO $$
DECLARE
  v_schema text := 'distribuidorajmerp';
  v_hechas text[] := ARRAY[]::text[];
  v_col    record;
BEGIN
  IF to_regclass(v_schema || '.bancos') IS NULL THEN
    RAISE EXCEPTION 'falta la tabla bancos — corré antes la migración 29';
  END IF;

  FOR v_col IN
    SELECT * FROM (VALUES
      ('es_cuenta_propia', 'boolean NOT NULL DEFAULT false'),
      ('numero_cuenta',    'text'),
      ('titular_cuenta',   'text'),
      -- RUC o cédula del titular: en Paraguay se pide para transferir.
      ('documento_titular', 'text'),
      ('alias_cuenta',     'text')
    ) AS t(campo, tipo)
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = v_schema AND table_name = 'bancos'
         AND column_name = v_col.campo
    );
    EXECUTE format('ALTER TABLE %I.bancos ADD COLUMN %I %s', v_schema, v_col.campo, v_col.tipo);
    v_hechas := v_hechas || ('bancos.' || v_col.campo)::text;
  END LOOP;

  IF array_length(v_hechas, 1) IS NULL THEN
    RAISE NOTICE 'no faltaba nada.';
  ELSE
    RAISE NOTICE 'agregado: %', array_to_string(v_hechas, ', ');
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

SELECT column_name AS campo, 'ok' AS estado
  FROM information_schema.columns
 WHERE table_schema = 'distribuidorajmerp' AND table_name = 'bancos'
   AND column_name IN ('es_cuenta_propia','numero_cuenta','titular_cuenta','documento_titular','alias_cuenta','codigo','tipo')
 ORDER BY column_name;
