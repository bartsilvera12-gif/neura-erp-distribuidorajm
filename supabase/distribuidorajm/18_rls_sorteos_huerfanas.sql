-- ============================================================================
-- 18. Cerrar las tres tablas de sorteos que quedaron sin RLS
-- ============================================================================
--
-- El chequeo de permisos mostró que casi todo el schema tiene RLS con sus
-- políticas, menos tres tablas del módulo de sorteos de la agencia:
--
--   sorteo_cierres_caja, sorteo_ticket_impresion, sorteo_venta_vendedor_sesiones
--
-- Las tres tienen los mismos GRANT que el resto —incluido `anon`, que es la
-- clave pública que viaja en el navegador— pero sin RLS que filtre. Con el
-- schema expuesto en PostgREST, eso es una puerta abierta: cualquiera con esa
-- clave podía leerlas, escribirlas o vaciarlas desde afuera del ERP.
--
-- No se usan: ningún archivo del código las nombra. Son restos del clon, así
-- que prenderles RLS no puede romper ninguna pantalla.
--
-- Sin políticas a propósito. Es el mismo criterio que el 16 para Agenda: la
-- clave de servicio del ERP salta la RLS, y todo lo demás queda afuera. Si
-- alguna vez se usa sorteos, ahí se escriben las políticas que correspondan.
--
-- Idempotente: prender RLS dos veces no cambia nada.
-- ============================================================================

DO $$
DECLARE
  v_schema text := 'distribuidorajmerp';
  v_tablas text[] := ARRAY[
    'sorteo_cierres_caja',
    'sorteo_ticket_impresion',
    'sorteo_venta_vendedor_sesiones'
  ];
  v_tabla  text;
  v_hechas text[] := ARRAY[]::text[];
  v_rls    boolean;
BEGIN
  FOREACH v_tabla IN ARRAY v_tablas LOOP
    IF to_regclass(v_schema || '.' || v_tabla) IS NULL THEN
      RAISE NOTICE '%: no existe, se omite.', v_tabla;
      CONTINUE;
    END IF;

    SELECT c.relrowsecurity INTO v_rls
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = v_schema AND c.relname = v_tabla;

    IF v_rls THEN
      RAISE NOTICE '%: ya tenía RLS.', v_tabla;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', v_schema, v_tabla);
    v_hechas := v_hechas || v_tabla;
  END LOOP;

  IF array_length(v_hechas, 1) IS NULL THEN
    RAISE NOTICE 'no hubo nada que cerrar.';
  ELSE
    RAISE NOTICE 'RLS prendida en %.', array_to_string(v_hechas, ', ');
  END IF;
END;
$$;

-- ── Verificación: ¿queda alguna tabla abierta a `anon` sin RLS? ────────────
-- Vacío = ninguna. Cualquier fila que salga acá es una puerta todavía abierta.
SELECT c.relname AS tabla_sin_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'distribuidorajmerp'
   AND c.relkind = 'r'
   AND NOT c.relrowsecurity
   AND EXISTS (
     SELECT 1 FROM information_schema.role_table_grants g
      WHERE g.table_schema = 'distribuidorajmerp'
        AND g.table_name = c.relname
        AND g.grantee = 'anon'
   )
 ORDER BY c.relname;
