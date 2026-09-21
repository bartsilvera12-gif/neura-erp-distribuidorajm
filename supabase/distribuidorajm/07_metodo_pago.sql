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
--   2. Agrega `cheque` a `ventas.metodo_pago` y a `caja_movimientos.medio_pago`,
--      preservando lo que cada una ya tenía. NO son la misma lista: ventas usa
--      `mixto` y caja_movimientos usa `otro`.
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

-- ── 2. Agregar `cheque` sin pisar los valores que ya existen ────────────────
-- La lista nueva se arma leyendo la actual del CHECK y sumándole `cheque`, en
-- vez de escribir una fija: una lista fija le borraría `otro` a
-- caja_movimientos o `mixto` a ventas, según cuál se eligiera.
DO $$
DECLARE
  t record;
  v_conname text;
  v_def text;
  v_valores text[];
  v_invalidos bigint;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('ventas',           'metodo_pago'),
      ('caja_movimientos', 'medio_pago')
    ) AS x(tabla, columna)
  LOOP
    IF to_regclass('distribuidorajmerp.' || t.tabla) IS NULL THEN
      RAISE NOTICE '%: no existe, se omite.', t.tabla;
      CONTINUE;
    END IF;

    SELECT conname, pg_get_constraintdef(oid) INTO v_conname, v_def
    FROM pg_constraint
    WHERE conrelid = ('distribuidorajmerp.' || t.tabla)::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%' || t.columna || '%'
    LIMIT 1;

    IF v_conname IS NULL THEN
      RAISE NOTICE '%.%: sin CHECK, no hace falta ampliarlo.', t.tabla, t.columna;
      CONTINUE;
    END IF;
    IF v_def LIKE '%cheque%' THEN
      RAISE NOTICE '%.%: ya acepta cheque.', t.tabla, t.columna;
      CONTINUE;
    END IF;

    -- Valores actuales, leídos del propio CHECK.
    SELECT array_agg(DISTINCT m[1] ORDER BY m[1])
    INTO v_valores
    FROM regexp_matches(v_def, $re$'([a-zA-Z_]+)'::text$re$, 'g') AS m;

    IF v_valores IS NULL OR cardinality(v_valores) = 0 THEN
      RAISE NOTICE '%.%: no se pudo leer la lista de valores, se omite.', t.tabla, t.columna;
      CONTINUE;
    END IF;
    -- array_append explícito: con el operador ||, Postgres intenta leer
    -- 'cheque' como literal de array y falla.
    v_valores := array_append(v_valores, 'cheque');

    EXECUTE format(
      'SELECT count(*) FROM distribuidorajmerp.%I WHERE %I IS NOT NULL AND NOT (%I = ANY($1))',
      t.tabla, t.columna, t.columna
    ) INTO v_invalidos USING v_valores;
    IF v_invalidos > 0 THEN
      RAISE EXCEPTION 'Hay % filas en % con un % fuera de la lista. Revisalas antes de ajustar el CHECK.',
        v_invalidos, t.tabla, t.columna;
    END IF;

    EXECUTE format('ALTER TABLE distribuidorajmerp.%I DROP CONSTRAINT %I', t.tabla, v_conname);
    EXECUTE format(
      'ALTER TABLE distribuidorajmerp.%I ADD CONSTRAINT %I CHECK (%I IS NULL OR %I = ANY(%L))',
      t.tabla, t.tabla || '_' || t.columna || '_check', t.columna, t.columna, v_valores
    );

    RAISE NOTICE '%.%: ahora acepta %', t.tabla, t.columna, array_to_string(v_valores, ', ');
  END LOOP;
END;
$$;

SELECT pg_notify('pgrst', 'reload schema');
