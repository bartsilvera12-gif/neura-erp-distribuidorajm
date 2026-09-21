-- ============================================================================
-- 31. Bancos: código y tipo
-- ============================================================================
--
-- La pantalla pasa a mostrar Código, Nombre, Tipo, Activo y acciones, como la
-- referencia. `tipo` distingue un banco de una billetera electrónica (Tigo
-- Money, Personal Pay), que en Paraguay son origen de cobro tan común como una
-- transferencia bancaria.
--
-- `codigo` es opcional y se usa solo para mostrar: el desplegable de cobros
-- sigue guardando el NOMBRE, así que los cobros ya registrados no se tocan.
--
-- Alcance: SOLO el schema `distribuidorajmerp`. No toca `public` ni ningún otro.
-- Idempotente: volver a correrlo no agrega nada ni cambia un solo dato.
-- ============================================================================

DO $$
DECLARE
  v_schema text := 'distribuidorajmerp';
  v_hechas text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass(v_schema || '.bancos') IS NULL THEN
    RAISE EXCEPTION 'falta la tabla bancos — corré antes la migración 29';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = v_schema AND table_name = 'bancos'
                    AND column_name = 'codigo') THEN
    EXECUTE format('ALTER TABLE %I.bancos ADD COLUMN codigo text', v_schema);
    v_hechas := v_hechas || 'bancos.codigo'::text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = v_schema AND table_name = 'bancos'
                    AND column_name = 'tipo') THEN
    EXECUTE format($f$ALTER TABLE %I.bancos ADD COLUMN tipo text NOT NULL DEFAULT 'banco'$f$, v_schema);
    v_hechas := v_hechas || 'bancos.tipo'::text;
  END IF;

  -- El código, cuando se carga, no se puede repetir dentro de la empresa.
  -- Índice parcial: los bancos sin código no molestan.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = v_schema AND tablename = 'bancos'
                    AND indexname = 'bancos_codigo_unico') THEN
    EXECUTE format($f$
      CREATE UNIQUE INDEX bancos_codigo_unico ON %I.bancos (empresa_id, upper(btrim(codigo)))
       WHERE codigo IS NOT NULL AND btrim(codigo) <> ''
    $f$, v_schema);
    v_hechas := v_hechas || 'bancos_codigo_unico'::text;
  END IF;

  IF array_length(v_hechas, 1) IS NULL THEN
    RAISE NOTICE 'no faltaba nada.';
  ELSE
    RAISE NOTICE 'agregado: %', array_to_string(v_hechas, ', ');
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

SELECT 'bancos' AS tabla, c.column_name AS campo, 'ok' AS estado
  FROM information_schema.columns c
 WHERE c.table_schema = 'distribuidorajmerp' AND c.table_name = 'bancos'
   AND c.column_name IN ('codigo', 'tipo', 'nombre', 'activo', 'sort_order')
 ORDER BY c.column_name;
