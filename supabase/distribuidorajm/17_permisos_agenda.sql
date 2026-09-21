-- ============================================================================
-- 17. Permisos de las tablas de Agenda
-- ============================================================================
--
-- El 16 creó `agenda_citas` y `agenda_cita_responsables`, y la pantalla pasó de
-- "no existe la tabla" a "permission denied for table agenda_citas". Crear una
-- tabla no le da permiso a nadie: los roles de Supabase —anon, authenticated,
-- service_role— reciben sus privilegios por GRANT explícito, y una tabla nueva
-- nace sin ninguno.
--
-- Los permisos no se escriben fijos: se copian de una tabla del mismo schema
-- que ya funciona. Así las de Agenda quedan exactamente con lo que el resto del
-- ERP tiene, sin adivinar nombres de roles ni otorgar de más.
--
-- Idempotente: volver a correrlo otorga lo mismo y no cambia nada.
-- ============================================================================

DO $$
DECLARE
  v_schema  text := 'distribuidorajmerp';
  v_modelo  text;
  v_nuevas  text[] := ARRAY['agenda_citas', 'agenda_cita_responsables'];
  v_tabla   text;
  r         record;
  v_n       int := 0;
BEGIN
  -- Una tabla que el ERP ya usa sin problemas, para copiarle los permisos.
  SELECT c.relname INTO v_modelo
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = v_schema
     AND c.relkind = 'r'
     AND c.relname IN ('ventas', 'clientes', 'productos', 'usuarios')
   ORDER BY array_position(ARRAY['ventas','clientes','productos','usuarios'], c.relname)
   LIMIT 1;

  IF v_modelo IS NULL THEN
    RAISE EXCEPTION 'no encontré una tabla de referencia en % para copiar permisos', v_schema;
  END IF;
  RAISE NOTICE 'copiando los permisos de %.%', v_schema, v_modelo;

  FOREACH v_tabla IN ARRAY v_nuevas LOOP
    IF to_regclass(v_schema || '.' || v_tabla) IS NULL THEN
      RAISE NOTICE '%: no existe, se omite (¿falta correr el 16?)', v_tabla;
      CONTINUE;
    END IF;

    FOR r IN
      SELECT DISTINCT grantee, privilege_type
        FROM information_schema.role_table_grants
       WHERE table_schema = v_schema
         AND table_name = v_modelo
         AND grantee <> 'PUBLIC'
    LOOP
      -- `privilege_type` sale del catálogo de Postgres, no de una entrada:
      -- son SELECT / INSERT / UPDATE / DELETE y compañía.
      EXECUTE format('GRANT %s ON TABLE %I.%I TO %I', r.privilege_type, v_schema, v_tabla, r.grantee);
      v_n := v_n + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'otorgados % permisos.', v_n;
END;
$$;

-- PostgREST cachea el schema: sin esto sigue contestando con el permiso viejo.
NOTIFY pgrst, 'reload schema';

-- ── Verificación: quién puede hacer qué sobre las tablas de Agenda ─────────
SELECT table_name AS tabla, grantee AS rol,
       string_agg(privilege_type, ', ' ORDER BY privilege_type) AS permisos
  FROM information_schema.role_table_grants
 WHERE table_schema = 'distribuidorajmerp'
   AND table_name IN ('agenda_citas', 'agenda_cita_responsables')
   AND grantee <> 'PUBLIC'
 GROUP BY table_name, grantee
 ORDER BY table_name, grantee;
