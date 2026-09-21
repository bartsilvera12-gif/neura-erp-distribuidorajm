-- =============================================================================
-- 09 · EL CAMIÓN COMO UBICACIÓN DE INVENTARIO
-- =============================================================================
-- Documento de relevamiento v0.2, "regla de oro del stock móvil": lo que no se
-- vendió no vuelve al salón si sigue arriba del camión. Tiene que quedar como
-- saldo de ESA ubicación y ser la apertura del día siguiente.
--
-- El ERP ya tiene todo lo necesario y no estaba en uso:
--   · inventario_ubicaciones      → la entidad `location` del documento
--   · inventario_stock_ubicacion  → stock por ubicación, único por producto
--   · movimientos_inventario      → kardex, y YA tiene ubicacion_id
--
-- Así que esto no crea tablas: amplía lo que hay.
--   1. `inventario_ubicaciones.tipo` acepta 'camion'.
--   2. `movimientos_inventario.origen` acepta los movimientos del ciclo móvil.
--   3. `camiones.ubicacion_id` vincula cada camión con su ubicación de stock.
--   4. `reparto_stock` guarda el conteo físico del cierre y el motivo.
--
-- Una transferencia camión→salón no necesita tabla propia: es el par
-- SALIDA/ENTRADA del kardex, que es como el ERP ya mueve stock.
--
-- Idempotente. Solo toca distribuidorajmerp.
-- =============================================================================

-- ── 1 y 2 · Ampliar los CHECK conservando los valores que ya tienen ─────────
-- Se lee la lista actual del propio CHECK y se le suman los valores nuevos. Una
-- lista fija escrita a mano borraría algún valor que el schema ya usa (fue lo
-- que casi pasa en el 07 con `otro` de caja_movimientos).
DO $$
DECLARE
  t record;
  v_conname text;
  v_def text;
  v_valores text[];
  v_nuevo text;
  v_faltan text[];
  v_invalidos bigint;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('inventario_ubicaciones', 'tipo',   ARRAY['camion']),
      ('movimientos_inventario', 'origen', ARRAY['carga_proveedor','transferencia','rendicion_reparto'])
    ) AS x(tabla, columna, agregar)
  LOOP
    IF to_regclass('distribuidorajmerp.' || t.tabla) IS NULL THEN
      RAISE NOTICE '%: no existe, se omite.', t.tabla;
      CONTINUE;
    END IF;

    SELECT conname, pg_get_constraintdef(oid) INTO v_conname, v_def
      FROM pg_constraint
     WHERE conrelid = ('distribuidorajmerp.' || t.tabla)::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%(' || t.columna || ' = ANY%'
     LIMIT 1;

    IF v_conname IS NULL THEN
      RAISE NOTICE '%.%: sin CHECK de lista, no hace falta ampliarlo.', t.tabla, t.columna;
      CONTINUE;
    END IF;

    -- Postgres escribe el CHECK de dos formas y hay que entender las dos:
    --   ANY (ARRAY['a'::text, 'b'::text])   ← como vino del schema original
    --   ANY ('{a,b}'::text[])               ← como queda después de reescribirlo
    -- Leer solo la primera hacía que una segunda corrida de este script fallara.
    SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_valores
      FROM regexp_matches(v_def, $re$'([a-zA-Z_]+)'::text$re$, 'g') AS m;

    IF v_valores IS NULL OR cardinality(v_valores) = 0 THEN
      SELECT array_agg(DISTINCT btrim(x) ORDER BY btrim(x)) INTO v_valores
        FROM unnest(string_to_array(
               (regexp_match(v_def, $re$ANY \s*\(\s*'\{([^}]*)\}'$re$))[1], ',')) AS x
       WHERE btrim(x) <> '';
    END IF;

    IF v_valores IS NULL OR cardinality(v_valores) = 0 THEN
      RAISE EXCEPTION '%.%: no se pudo leer la lista de valores del CHECK. Definición: %',
        t.tabla, t.columna, v_def;
    END IF;

    v_faltan := '{}';
    FOREACH v_nuevo IN ARRAY t.agregar LOOP
      IF NOT (v_nuevo = ANY(v_valores)) THEN
        v_valores := array_append(v_valores, v_nuevo);
        v_faltan  := array_append(v_faltan, v_nuevo);
      END IF;
    END LOOP;

    IF cardinality(v_faltan) = 0 THEN
      RAISE NOTICE '%.%: ya acepta todo lo que hace falta.', t.tabla, t.columna;
      CONTINUE;
    END IF;

    -- Ninguna fila puede quedar fuera de la lista nueva.
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
      'ALTER TABLE distribuidorajmerp.%I ADD CONSTRAINT %I CHECK (%I = ANY(%L))',
      t.tabla, v_conname, t.columna, v_valores
    );

    RAISE NOTICE '%.%: + % (ahora: %)',
      t.tabla, t.columna, array_to_string(v_faltan, ', '), array_to_string(v_valores, ', ');
  END LOOP;
END;
$$;

-- ── 3 · El camión apunta a su ubicación de stock ────────────────────────────
ALTER TABLE distribuidorajmerp.camiones
  ADD COLUMN IF NOT EXISTS ubicacion_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'distribuidorajmerp.camiones'::regclass
       AND conname = 'camiones_ubicacion_id_fkey'
  ) THEN
    ALTER TABLE distribuidorajmerp.camiones
      ADD CONSTRAINT camiones_ubicacion_id_fkey
      FOREIGN KEY (ubicacion_id)
      REFERENCES distribuidorajmerp.inventario_ubicaciones(id) ON DELETE RESTRICT;
  END IF;

  -- Una ubicación no puede ser el depósito de dos camiones: el stock de uno
  -- se leería como el del otro.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'distribuidorajmerp' AND indexname = 'camiones_ubicacion_id_key'
  ) THEN
    CREATE UNIQUE INDEX camiones_ubicacion_id_key
      ON distribuidorajmerp.camiones (ubicacion_id)
      WHERE ubicacion_id IS NOT NULL;
  END IF;
END;
$$;

-- Cada camión existente estrena su ubicación. El alta de camión crea la suya
-- desde la aplicación; esto es para los que ya estaban cargados.
DO $$
DECLARE
  c record;
  v_id uuid;
  v_creadas int := 0;
BEGIN
  FOR c IN
    SELECT id, empresa_id, alias FROM distribuidorajmerp.camiones WHERE ubicacion_id IS NULL
  LOOP
    INSERT INTO distribuidorajmerp.inventario_ubicaciones (empresa_id, nombre, tipo, activo)
    VALUES (c.empresa_id, 'Camión ' || c.alias, 'camion', true)
    RETURNING id INTO v_id;

    UPDATE distribuidorajmerp.camiones SET ubicacion_id = v_id, updated_at = now() WHERE id = c.id;
    v_creadas := v_creadas + 1;
  END LOOP;
  RAISE NOTICE 'Ubicaciones de camión creadas: %', v_creadas;
END;
$$;

-- ── 4 · Conteo físico por producto en el cierre ─────────────────────────────
-- El documento (págs. 4 y 7) pide teórico vs físico contado, con motivo
-- obligatorio en cada diferencia. `cantidad_contada` es NULL mientras no se
-- contó: 0 contado y "sin contar" no son lo mismo.
ALTER TABLE distribuidorajmerp.reparto_stock
  ADD COLUMN IF NOT EXISTS cantidad_contada numeric,
  ADD COLUMN IF NOT EXISTS motivo_diferencia text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'distribuidorajmerp.reparto_stock'::regclass
       AND conname = 'reparto_stock_cantidad_contada_check'
  ) THEN
    ALTER TABLE distribuidorajmerp.reparto_stock
      ADD CONSTRAINT reparto_stock_cantidad_contada_check
      CHECK (cantidad_contada IS NULL OR cantidad_contada >= 0);
  END IF;
END;
$$;

-- ── 5 · El único que necesita el upsert de stock por ubicación ─────────────
-- `catalogos-pg.ts` y `recepciones-pg.ts` hacen
-- ON CONFLICT (empresa_id, producto_id, ubicacion_id) sobre esta tabla, y sin un
-- único que lo respalde Postgres rechaza la sentencia entera. En el diagnóstico
-- no aparecía ninguno, así que se crea si falta. Se busca por columnas y no por
-- nombre: si ya existe con otro nombre, no se duplica.
DO $$
DECLARE
  v_existe boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indrelid
     WHERE c.oid = 'distribuidorajmerp.inventario_stock_ubicacion'::regclass
       AND i.indisunique
       AND i.indnatts = 3
       AND (
         SELECT array_agg(a.attname::text ORDER BY a.attname)
           FROM unnest(i.indkey::int[]) AS k(attnum)
           JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
       ) = ARRAY['empresa_id','producto_id','ubicacion_id']
  ) INTO v_existe;

  IF v_existe THEN
    RAISE NOTICE 'inventario_stock_ubicacion: el único por (empresa, producto, ubicación) ya está.';
  ELSE
    ALTER TABLE distribuidorajmerp.inventario_stock_ubicacion
      ADD CONSTRAINT inventario_stock_ubicacion_empresa_producto_ubicacion_key
      UNIQUE (empresa_id, producto_id, ubicacion_id);
    RAISE NOTICE 'inventario_stock_ubicacion: único creado. Sin él, el upsert de stock fallaba.';
  END IF;
END;
$$;

-- ── Índices de lectura del stock por ubicación ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_stock_ubicacion_ubicacion
  ON distribuidorajmerp.inventario_stock_ubicacion (ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_mov_inventario_ubicacion
  ON distribuidorajmerp.movimientos_inventario (ubicacion_id, fecha DESC);

SELECT pg_notify('pgrst', 'reload schema');
