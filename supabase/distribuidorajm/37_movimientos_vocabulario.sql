-- ============================================================================
-- 37. El vocabulario de movimientos_inventario
-- ============================================================================
--
-- Síntoma: new row for relation "movimientos_inventario" violates check
-- constraint "movimientos_inventario_origen_check", al registrar una recepción.
--
-- Tercera vez el mismo patrón: la tabla viene del schema original y sus CHECK
-- enumeran los valores de AQUEL sistema. Esta vez sobre `origen`.
--
-- Para no volver dentro de dos días por `tipo` o `documento_tipo`, esto cubre
-- las tres columnas de una vez, con el vocabulario completo del código:
--
--   tipo            ENTRADA | SALIDA | AJUSTE
--   origen          compra, recepcion, venta, anulacion, transferencia,
--                   rendicion_reparto, inventario_inicial
--   documento_tipo  compra | recepcion
--
-- Se reemplazan los CHECK, no se borran: un valor escrito mal debe seguir
-- fallando. Van NOT VALID para no rechazar los movimientos ya guardados.
--
-- Alcance: SOLO el schema `distribuidorajmerp`. No toca `public` ni ningún otro.
-- Idempotente: volver a correrlo deja el mismo resultado.
-- ============================================================================

DO $$
DECLARE
  v_schema text := 'distribuidorajmerp';
  v_hechas text[] := ARRAY[]::text[];
  v_con    record;
BEGIN
  IF to_regclass(v_schema || '.movimientos_inventario') IS NULL THEN
    RAISE EXCEPTION 'falta movimientos_inventario en este schema';
  END IF;

  -- Fuera los CHECK heredados sobre tipo / origen / documento_tipo.
  FOR v_con IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = v_schema
       AND c.contype = 'c'
       AND t.relname = 'movimientos_inventario'
       AND pg_get_constraintdef(c.oid) ~ '\m(tipo|origen|documento_tipo)\M'
  LOOP
    EXECUTE format('ALTER TABLE %I.movimientos_inventario DROP CONSTRAINT %I', v_schema, v_con.conname);
    v_hechas := v_hechas || ('borrado ' || v_con.conname)::text;
  END LOOP;

  EXECUTE format($f$
    ALTER TABLE %I.movimientos_inventario ADD CONSTRAINT movimientos_tipo_valido
      CHECK (tipo IS NULL OR tipo IN ('ENTRADA','SALIDA','AJUSTE')) NOT VALID
  $f$, v_schema);

  EXECUTE format($f$
    ALTER TABLE %I.movimientos_inventario ADD CONSTRAINT movimientos_origen_valido
      CHECK (origen IS NULL OR origen IN
        ('compra','recepcion','venta','anulacion','transferencia',
         'rendicion_reparto','inventario_inicial')) NOT VALID
  $f$, v_schema);

  EXECUTE format($f$
    ALTER TABLE %I.movimientos_inventario ADD CONSTRAINT movimientos_documento_valido
      CHECK (documento_tipo IS NULL OR documento_tipo IN ('compra','recepcion')) NOT VALID
  $f$, v_schema);

  v_hechas := v_hechas || 'movimientos_tipo_valido, movimientos_origen_valido, movimientos_documento_valido'::text;
  RAISE NOTICE '%', array_to_string(v_hechas, ' · ');
END;
$$;

NOTIFY pgrst, 'reload schema';
-- Verificación: lee la definición real del CHECK. No escribe nada.
WITH esperado(columna, restriccion, valor) AS (
  VALUES
    ('tipo','movimientos_tipo_valido','ENTRADA'),
    ('tipo','movimientos_tipo_valido','SALIDA'),
    ('tipo','movimientos_tipo_valido','AJUSTE'),
    ('origen','movimientos_origen_valido','compra'),
    ('origen','movimientos_origen_valido','recepcion'),
    ('origen','movimientos_origen_valido','venta'),
    ('origen','movimientos_origen_valido','anulacion'),
    ('origen','movimientos_origen_valido','transferencia'),
    ('origen','movimientos_origen_valido','rendicion_reparto'),
    ('origen','movimientos_origen_valido','inventario_inicial'),
    ('documento_tipo','movimientos_documento_valido','compra'),
    ('documento_tipo','movimientos_documento_valido','recepcion')
), definicion AS (
  SELECT c.conname AS restriccion, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname = 'distribuidorajmerp' AND c.contype = 'c'
     AND t.relname = 'movimientos_inventario'
)
SELECT e.columna, e.valor,
       CASE
         WHEN d.def IS NULL THEN '✗ falta la restricción'
         WHEN position(quote_literal(e.valor) in d.def) > 0 THEN 'ok'
         ELSE '✗ el CHECK no lo acepta'
       END AS resultado
  FROM esperado e
  LEFT JOIN definicion d ON d.restriccion = e.restriccion
 ORDER BY (CASE WHEN d.def IS NOT NULL AND position(quote_literal(e.valor) in d.def) > 0
                THEN 1 ELSE 0 END), e.columna, e.valor;
