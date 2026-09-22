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

-- ── Verificación: los estados que el código escribe, uno por uno ───────────
-- Se prueban contra el CHECK real de la tabla. Nada queda guardado.
DO $$
DECLARE
  v_estado text;
  v_malos  text[] := ARRAY[]::text[];
BEGIN
  FOREACH v_estado IN ARRAY ARRAY['borrador','aprobada','parcialmente_recibida','recibida','cerrada','cancelada']
  LOOP
    BEGIN
      INSERT INTO distribuidorajmerp.ordenes_compra (empresa_id, estado)
        VALUES ('00000000-0000-0000-0000-000000000000', v_estado);
    EXCEPTION WHEN check_violation THEN
      v_malos := v_malos || v_estado;
    END;
  END LOOP;
  -- No dejamos basura: se borra todo lo de la empresa de prueba.
  DELETE FROM distribuidorajmerp.ordenes_compra
   WHERE empresa_id = '00000000-0000-0000-0000-000000000000';

  IF array_length(v_malos, 1) IS NULL THEN
    RAISE NOTICE 'ok: los 6 estados de una orden pasan el CHECK.';
  ELSE
    RAISE EXCEPTION 'siguen rechazados: %', array_to_string(v_malos, ', ');
  END IF;
END;
$$;

SELECT conname AS restriccion, pg_get_constraintdef(c.oid) AS definicion
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
 WHERE n.nspname = 'distribuidorajmerp' AND c.contype = 'c'
   AND t.relname IN ('ordenes_compra','recepciones')
 ORDER BY t.relname, conname;
