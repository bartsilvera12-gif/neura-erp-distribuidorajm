-- ============================================================================
-- 22. Columnas de estado contable que le faltan a los documentos
-- ============================================================================
--
-- Síntoma: "column pagos.estado_contable does not exist" al abrir Comisiones.
--
-- `estado_contable` marca en qué punto está un documento respecto de la
-- contabilidad: pendiente, contabilizado, revertido o error. El ERP la usa
-- incluso donde no hay contabilidad, porque es con eso que descarta los pagos
-- revertidos: la consulta de comisiones pide "todos los pagos salvo los
-- revertidos" y sin la columna no puede ni empezar.
--
-- Este schema no las tiene. Se agregan en los cinco documentos que el código
-- lee, pero SOLO donde la tabla existe y la columna falta. Todo lo que ya esté
-- cargado queda como está: las columnas nuevas nacen en 'pendiente', que es
-- exactamente lo que son —documentos que nunca se asentaron—.
--
-- Esto NO prende la contabilidad ni arma asientos. Es el andamiaje que las
-- consultas necesitan para poder filtrar.
--
-- Alcance: SOLO el schema `distribuidorajmerp`. No toca `public` ni ningún otro.
-- Idempotente: volver a correrlo no agrega nada ni cambia un solo dato.
-- ============================================================================

DO $$
DECLARE
  v_schema    text := 'distribuidorajmerp';
  v_agregadas text[] := ARRAY[]::text[];
  v_col       record;
BEGIN
  FOR v_col IN
    SELECT * FROM (VALUES
      -- Pagos: lo que rompía Comisiones.
      ('pagos',    'estado_contable',     'text NOT NULL DEFAULT ''pendiente'''),
      ('pagos',    'asiento_contable_id', 'uuid'),
      ('pagos',    'es_anticipo',         'boolean NOT NULL DEFAULT false'),
      -- Facturas: mismo filtro en anulación y en reportes.
      ('facturas', 'estado_contable',     'text NOT NULL DEFAULT ''pendiente'''),
      ('facturas', 'asiento_contable_id', 'uuid'),
      ('facturas', 'contab_error',        'text'),
      -- Compras, ventas y gastos: los otros tres documentos que se asientan.
      ('compras',  'estado_contable',     'text NOT NULL DEFAULT ''pendiente'''),
      ('compras',  'asiento_contable_id', 'uuid'),
      ('compras',  'contab_error',        'text'),
      ('ventas',   'estado_contable',     'text NOT NULL DEFAULT ''pendiente'''),
      ('ventas',   'asiento_contable_id', 'uuid'),
      ('ventas',   'contab_error',        'text'),
      ('gastos',   'estado_contable',     'text NOT NULL DEFAULT ''pendiente'''),
      ('gastos',   'asiento_contable_id', 'uuid'),
      ('gastos',   'contab_error',        'text')
    ) AS t(tabla, campo, tipo)
  LOOP
    -- Una tabla que este schema no tiene se saltea sin ruido: no todas las
    -- empresas tienen los cinco documentos.
    CONTINUE WHEN to_regclass(v_schema || '.' || v_col.tabla) IS NULL;

    CONTINUE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = v_schema
         AND table_name = v_col.tabla
         AND column_name = v_col.campo
    );

    EXECUTE format('ALTER TABLE %I.%I ADD COLUMN %I %s',
                   v_schema, v_col.tabla, v_col.campo, v_col.tipo);
    v_agregadas := v_agregadas || (v_col.tabla || '.' || v_col.campo)::text;
  END LOOP;

  IF array_length(v_agregadas, 1) IS NULL THEN
    RAISE NOTICE 'no faltaba ninguna columna: no se cambió nada.';
  ELSE
    RAISE NOTICE 'columnas agregadas: %', array_to_string(v_agregadas, ', ');
  END IF;
END;
$$;

-- El índice que usa el filtro de comisiones ("todos los pagos del período salvo
-- los revertidos"). Sin él la consulta funciona igual, solo que recorriendo todo.
DO $$
DECLARE v_schema text := 'distribuidorajmerp';
BEGIN
  IF to_regclass(v_schema || '.pagos') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_pagos_estado_contable')
  THEN
    EXECUTE format('CREATE INDEX idx_pagos_estado_contable ON %I.pagos (empresa_id, estado_contable)', v_schema);
  END IF;
END;
$$;

-- PostgREST cachea las columnas de cada tabla: sin esto sigue contestando que
-- `estado_contable` no existe aunque ya esté.
NOTIFY pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────────
-- Las cinco tablas con sus columnas de contabilidad. Cada fila que diga "falta"
-- es una consulta que va a seguir fallando.
SELECT t.tabla,
       CASE WHEN to_regclass('distribuidorajmerp.' || t.tabla) IS NULL THEN 'la tabla no existe acá'
            WHEN EXISTS (SELECT 1 FROM information_schema.columns c
                          WHERE c.table_schema = 'distribuidorajmerp'
                            AND c.table_name = t.tabla AND c.column_name = 'estado_contable')
            THEN 'ok'
            ELSE 'FALTA estado_contable'
       END AS estado_contable,
       CASE WHEN to_regclass('distribuidorajmerp.' || t.tabla) IS NULL THEN '—'
            WHEN EXISTS (SELECT 1 FROM information_schema.columns c
                          WHERE c.table_schema = 'distribuidorajmerp'
                            AND c.table_name = t.tabla AND c.column_name = 'asiento_contable_id')
            THEN 'ok'
            ELSE 'FALTA asiento_contable_id'
       END AS asiento_contable_id
  FROM (VALUES ('pagos'), ('facturas'), ('compras'), ('ventas'), ('gastos')) AS t(tabla)
 ORDER BY t.tabla;

-- Y cómo quedaron los pagos ya cargados: todos deberían decir 'pendiente'.
SELECT estado_contable, count(*) AS pagos
  FROM distribuidorajmerp.pagos
 GROUP BY estado_contable;
