-- ============================================================================
-- 36. Los estados que la tabla heredada no conoce
-- ============================================================================
--
-- Síntoma: new row for relation "ordenes_compra" violates check constraint
-- "ordenes_compra_estado_check", al guardar una orden en 'borrador'.
--
-- Misma raíz que la 35: `ordenes_compra` viene del schema original y su CHECK
-- enumera los estados de AQUEL sistema, no los que escribe este código.
--
-- El vocabulario real, sacado de la máquina de estados del código:
--   ordenes_compra.estado
--     borrador → aprobada → parcialmente_recibida → recibida → cerrada
--     y `cancelada` desde cualquiera antes del cierre.
--   recepciones.estado              confirmada | anulada
--   recepciones.estado_facturacion  pendiente | parcial | facturada
--
-- Se reemplazan los CHECK de estado por estos, en vez de borrarlos y quedarse
-- sin control: un estado escrito mal debe seguir fallando, lo que no puede
-- pasar es que falle un estado correcto.
--
-- También corrige el valor por defecto de `recepciones.estado`, que en la
-- migración 34 quedó en 'recibida' cuando el código escribe 'confirmada'.
--
-- Alcance: SOLO el schema `distribuidorajmerp`. No toca `public` ni ningún otro.
-- Idempotente: volver a correrlo no cambia nada.
-- ============================================================================

DO $$
DECLARE
  v_schema text := 'distribuidorajmerp';
  v_hechas text[] := ARRAY[]::text[];
  v_con    record;
BEGIN
  -- ── 1. Fuera los CHECK heredados sobre columnas de estado ────────────────
  FOR v_con IN
    SELECT c.conname, t.relname AS tabla
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = v_schema
       AND c.contype = 'c'
       AND t.relname IN ('ordenes_compra','recepciones')
       AND pg_get_constraintdef(c.oid) ~ '\mestado'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', v_schema, v_con.tabla, v_con.conname);
    v_hechas := v_hechas || ('borrado ' || v_con.conname)::text;
  END LOOP;

  -- ── 2. Los CHECK con el vocabulario de este código ───────────────────────
  IF to_regclass(v_schema || '.ordenes_compra') IS NOT NULL THEN
    -- Las filas viejas con estados de otro sistema quedarían fuera del CHECK:
    -- NOT VALID lo aplica a lo nuevo sin rechazar lo que ya está guardado.
    EXECUTE format($f$
      ALTER TABLE %I.ordenes_compra ADD CONSTRAINT ordenes_compra_estado_valido
        CHECK (estado IS NULL OR estado IN
          ('borrador','aprobada','parcialmente_recibida','recibida','cerrada','cancelada'))
        NOT VALID
    $f$, v_schema);
    v_hechas := v_hechas || 'ordenes_compra_estado_valido'::text;
  END IF;

  IF to_regclass(v_schema || '.recepciones') IS NOT NULL THEN
    EXECUTE format($f$
      ALTER TABLE %I.recepciones ADD CONSTRAINT recepciones_estado_valido
        CHECK (estado IS NULL OR estado IN ('confirmada','anulada')) NOT VALID
    $f$, v_schema);
    EXECUTE format($f$
      ALTER TABLE %I.recepciones ADD CONSTRAINT recepciones_facturacion_valida
        CHECK (estado_facturacion IS NULL OR estado_facturacion IN
          ('pendiente','parcial','facturada')) NOT VALID
    $f$, v_schema);
    EXECUTE format($f$ALTER TABLE %I.recepciones ALTER COLUMN estado SET DEFAULT 'confirmada'$f$, v_schema);
    v_hechas := v_hechas || 'recepciones_estado_valido, recepciones_facturacion_valida, default de recepciones.estado'::text;
  END IF;

  RAISE NOTICE '%', array_to_string(v_hechas, ' · ');
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────────
-- Se lee la definición real del CHECK en la tabla y se comprueba que cada
-- estado del código esté adentro. Antes esto insertaba una orden de prueba,
-- lo que obligaba a completar todas las columnas obligatorias de la tabla:
-- verificar no tiene por qué escribir nada.
WITH esperado(tabla, restriccion, valor) AS (
  VALUES
    ('ordenes_compra','ordenes_compra_estado_valido','borrador'),
    ('ordenes_compra','ordenes_compra_estado_valido','aprobada'),
    ('ordenes_compra','ordenes_compra_estado_valido','parcialmente_recibida'),
    ('ordenes_compra','ordenes_compra_estado_valido','recibida'),
    ('ordenes_compra','ordenes_compra_estado_valido','cerrada'),
    ('ordenes_compra','ordenes_compra_estado_valido','cancelada'),
    ('recepciones','recepciones_estado_valido','confirmada'),
    ('recepciones','recepciones_estado_valido','anulada'),
    ('recepciones','recepciones_facturacion_valida','pendiente'),
    ('recepciones','recepciones_facturacion_valida','parcial'),
    ('recepciones','recepciones_facturacion_valida','facturada')
), definicion AS (
  SELECT t.relname AS tabla, c.conname AS restriccion,
         pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname = 'distribuidorajmerp' AND c.contype = 'c'
)
SELECT e.tabla, e.valor AS estado,
       CASE
         WHEN d.def IS NULL THEN '✗ falta la restricción'
         WHEN position(quote_literal(e.valor) in d.def) > 0 THEN 'ok'
         ELSE '✗ el CHECK no lo acepta'
       END AS resultado
  FROM esperado e
  LEFT JOIN definicion d ON d.tabla = e.tabla AND d.restriccion = e.restriccion
 ORDER BY (CASE WHEN d.def IS NOT NULL AND position(quote_literal(e.valor) in d.def) > 0
                THEN 1 ELSE 0 END), e.tabla, e.valor;
