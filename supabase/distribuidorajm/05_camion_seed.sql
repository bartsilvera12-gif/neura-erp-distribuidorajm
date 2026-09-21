-- =============================================================================
-- 05 · Seed del primer camión para Distribuidora JM
--
-- Corre DESPUÉS de que la migración `20260914130000_repartos_modulo.sql` haya
-- creado las tablas del módulo en el schema `distribuidorajmerp`.
--
-- Es idempotente: si ya existe un camión con alias "Camión 01" para esta
-- empresa, no lo duplica.
--
-- Ajustá alias / patente si cambia. La empresa_id es la del ERP nuevo, fijada
-- en el 03.
-- =============================================================================

DO $$
DECLARE
  v_empresa_id constant uuid := '058efef5-e1b5-4cab-8a65-238f81823917';
  v_existe     boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'distribuidorajmerp') THEN
    RAISE EXCEPTION 'Schema `distribuidorajmerp` no existe. Corré primero 01_clonar_schema.sql y la migración de repartos.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'distribuidorajmerp' AND c.relname = 'camiones' AND c.relkind = 'r'
  ) THEN
    RAISE EXCEPTION 'Tabla `distribuidorajmerp.camiones` no existe. Corré la migración de repartos primero.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM distribuidorajmerp.camiones
    WHERE empresa_id = v_empresa_id AND lower(alias) = 'camión 01'
  ) INTO v_existe;

  IF v_existe THEN
    RAISE NOTICE 'Camión 01 ya existe para la empresa, no se inserta.';
  ELSE
    INSERT INTO distribuidorajmerp.camiones (empresa_id, alias, patente, activo)
    VALUES (v_empresa_id, 'Camión 01', NULL, true);
    RAISE NOTICE 'Camión 01 creado para Distribuidora JM.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
