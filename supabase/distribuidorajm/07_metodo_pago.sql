-- =============================================================================
-- 07 · CORREGIR EL MEDIO DE COBRO: sacar `forma_pago`, ampliar `metodo_pago`
-- =============================================================================
-- `ventas` ya tenía `metodo_pago` (efectivo | tarjeta | transferencia | mixto)
-- y `tipo_venta` (CONTADO | CREDITO). La columna `forma_pago` que agregó
-- 05_forma_pago.sql colapsaba los dos conceptos: metía `credito`, que es
-- tipo_venta, e inventaba `cheque`, que el modelo no tenía. Resultado: el
-- medio de cobro quedaba partido en dos columnas.
--
-- Este script:
--   1. Borra `forma_pago` y todo lo suyo. Aborta si alguna venta la usa.
--   2. Agrega `cheque` a los valores válidos de `metodo_pago`.
--   3. Hace lo mismo con `caja_movimientos.medio_pago`, si tiene CHECK.
--
-- Idempotente. Solo toca distribuidorajmerp.
-- =============================================================================

-- ── 1. Sacar forma_pago ─────────────────────────────────────────────────────
DO $$
DECLARE
  v_en_uso bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'distribuidorajmerp' AND table_name = 'ventas'
      AND column_name = 'forma_pago'
  ) THEN
    EXECUTE 'SELECT count(*) FROM distribuidorajmerp.ventas WHERE forma_pago IS NOT NULL'
      INTO v_en_uso;

    -- Si alguna venta ya la usa, borrarla perdería el dato en silencio.
    IF v_en_uso > 0 THEN
      RAISE EXCEPTION
        'Hay % ventas con forma_pago cargada. Migrá ese dato a metodo_pago antes de correr este script.',
        v_en_uso;
    END IF;

    ALTER TABLE distribuidorajmerp.ventas DROP CONSTRAINT IF EXISTS ventas_forma_pago_check;
    ALTER TABLE distribuidorajmerp.ventas DROP CONSTRAINT IF EXISTS ventas_forma_pago_coherente_check;
    DROP INDEX IF EXISTS distribuidorajmerp.idx_ventas_forma_pago;
    ALTER TABLE distribuidorajmerp.ventas DROP COLUMN forma_pago;

    RAISE NOTICE 'forma_pago eliminada de ventas.';
  ELSE
    RAISE NOTICE 'forma_pago ya no existe: nada que hacer.';
  END IF;
END;
$$;

-- ── 2. Ampliar metodo_pago con `cheque` ─────────────────────────────────────
DO $$
DECLARE
  v_conname text;
  v_invalidos bigint;
BEGIN
  -- El CHECK existente se busca por su definición y no por nombre: el nombre
  -- lo puso Postgres y no tiene por qué ser el mismo en todos los schemas.
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'distribuidorajmerp.ventas'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%metodo_pago%'
  LIMIT 1;

  -- Si ya acepta cheque, no hay nada que hacer.
  IF v_conname IS NOT NULL AND (
    SELECT pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conrelid = 'distribuidorajmerp.ventas'::regclass AND conname = v_conname
  ) LIKE '%cheque%' THEN
    RAISE NOTICE 'metodo_pago ya acepta cheque.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_invalidos
  FROM distribuidorajmerp.ventas
  WHERE metodo_pago IS NOT NULL
    AND metodo_pago NOT IN ('efectivo', 'tarjeta', 'transferencia', 'mixto', 'cheque');
  IF v_invalidos > 0 THEN
    RAISE EXCEPTION
      'Hay % ventas con un metodo_pago fuera de la lista nueva. Revisalas antes de ajustar el CHECK.',
      v_invalidos;
  END IF;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE distribuidorajmerp.ventas DROP CONSTRAINT %I', v_conname);
  END IF;

  ALTER TABLE distribuidorajmerp.ventas
    ADD CONSTRAINT ventas_metodo_pago_check
    CHECK (metodo_pago IS NULL OR metodo_pago IN ('efectivo','tarjeta','transferencia','mixto','cheque'));

  RAISE NOTICE 'metodo_pago ahora acepta cheque.';
END;
$$;

-- ── 3. Lo mismo en caja_movimientos.medio_pago ──────────────────────────────
DO $$
DECLARE
  v_conname text;
  v_def text;
  v_invalidos bigint;
BEGIN
  IF to_regclass('distribuidorajmerp.caja_movimientos') IS NULL THEN
    RAISE NOTICE 'No hay caja_movimientos: se omite.';
    RETURN;
  END IF;

  SELECT conname, pg_get_constraintdef(oid) INTO v_conname, v_def
  FROM pg_constraint
  WHERE conrelid = 'distribuidorajmerp.caja_movimientos'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%medio_pago%'
  LIMIT 1;

  IF v_conname IS NULL THEN
    RAISE NOTICE 'medio_pago no tiene CHECK: no hace falta ampliarlo.';
    RETURN;
  END IF;
  IF v_def LIKE '%cheque%' THEN
    RAISE NOTICE 'medio_pago ya acepta cheque.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_invalidos
  FROM distribuidorajmerp.caja_movimientos
  WHERE medio_pago IS NOT NULL
    AND medio_pago NOT IN ('efectivo', 'tarjeta', 'transferencia', 'mixto', 'cheque');
  IF v_invalidos > 0 THEN
    RAISE EXCEPTION
      'Hay % movimientos con un medio_pago fuera de la lista nueva. Revisalos antes de ajustar el CHECK.',
      v_invalidos;
  END IF;

  EXECUTE format('ALTER TABLE distribuidorajmerp.caja_movimientos DROP CONSTRAINT %I', v_conname);
  ALTER TABLE distribuidorajmerp.caja_movimientos
    ADD CONSTRAINT caja_movimientos_medio_pago_check
    CHECK (medio_pago IN ('efectivo','tarjeta','transferencia','mixto','cheque'));

  RAISE NOTICE 'medio_pago de caja_movimientos ahora acepta cheque.';
END;
$$;

SELECT pg_notify('pgrst', 'reload schema');
