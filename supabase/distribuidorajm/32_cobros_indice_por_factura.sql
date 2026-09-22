-- ============================================================================
-- 32. Corrección de un índice que puse mal en la migración 30
-- ============================================================================
--
-- En la 30 creé `cobros_pendientes_operacion_unica` sobre
-- (empresa_id, banco_origen_norm, numero_operacion_norm). Está mal.
--
-- Una transferencia puede cubrir VARIAS facturas, y el código guarda a
-- propósito el MISMO número de operación en cada una para poder agruparlas
-- después en la conciliación. Con mi índice, la segunda factura de esa misma
-- transferencia chocaba y se caía todo el cobro.
--
-- Lo que sí hay que impedir es cargar dos veces LA MISMA factura con la misma
-- transferencia. Eso es lo que dice el propio mensaje de error del código:
-- "Ya existe una carga para la factura X con ese banco y N° de operación".
-- Así que la clave lleva `factura_id`.
--
-- Alcance: SOLO el schema `distribuidorajmerp`. No toca `public` ni ningún otro.
-- Idempotente: volver a correrlo no cambia nada.
-- ============================================================================

DO $$
DECLARE
  v_schema text := 'distribuidorajmerp';
BEGIN
  IF to_regclass(v_schema || '.cobros_pendientes') IS NULL THEN
    RAISE EXCEPTION 'falta cobros_pendientes — corré antes la migración 30';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes
              WHERE schemaname = v_schema AND tablename = 'cobros_pendientes'
                AND indexname = 'cobros_pendientes_operacion_unica') THEN
    EXECUTE format('DROP INDEX %I.cobros_pendientes_operacion_unica', v_schema);
    RAISE NOTICE 'borrado el indice equivocado.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = v_schema AND tablename = 'cobros_pendientes'
                    AND indexname = 'cobros_pendientes_factura_operacion') THEN
    EXECUTE format($f$
      CREATE UNIQUE INDEX cobros_pendientes_factura_operacion
          ON %I.cobros_pendientes (empresa_id, factura_id, banco_origen_norm, numero_operacion_norm)
       WHERE factura_id IS NOT NULL
         AND numero_operacion_norm IS NOT NULL AND numero_operacion_norm <> ''
    $f$, v_schema);
    RAISE NOTICE 'creado: cobros_pendientes_factura_operacion';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

SELECT indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'distribuidorajmerp' AND tablename = 'cobros_pendientes'
 ORDER BY indexname;
