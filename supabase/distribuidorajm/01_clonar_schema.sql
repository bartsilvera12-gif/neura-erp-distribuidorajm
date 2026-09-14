-- =============================================================================
-- 01 · CLON ESTRUCTURAL COMPLETO  instemaq  →  distribuidorajmerp
-- =============================================================================
-- Copia SOLO la estructura (0 filas): tablas, secuencias, PK/UNIQUE/CHECK,
-- índices, FKs, triggers, RLS + policies, vistas, vistas materializadas,
-- funciones/RPC, grants y membresía en la publicación `supabase_realtime`.
--
-- GARANTÍAS DE AISLAMIENTO
--   · Solo hace CREATE dentro de `distribuidorajmerp`. No toca `public`,
--     `auth`, `storage`, ni el schema origen (solo lo LEE).
--   · Toda referencia interna `<origen>.x` se reescribe a `distribuidorajmerp.x`,
--     así que el ERP nuevo no queda colgado del ERP viejo.
--   · Las referencias a `auth.users` se mantienen (son de Supabase, compartidas).
--   · Aborta si `distribuidorajmerp` ya existe (no pisa nada).
--
-- Correr como `postgres` / service_role. Es una sola transacción: si algo
-- crítico falla, no queda nada a medias.
-- =============================================================================

DO $clone$
DECLARE
  ---------------------------------------------------------------------------
  v_src  text := 'instemaq';            -- origen: schema del ERP sistemas-propio
  v_tgt  text := 'distribuidorajmerp';  -- destino (no cambiar)
  ---------------------------------------------------------------------------
  v_tables  text[];
  v_pub     text := 'supabase_realtime';
  r         RECORD;
  tbl       text;
  def       text;
  qual      text;
  chk       text;
  roles_clause text;
  v_viewdef text;
  fdef      text;
  fn_oid    oid;
  v_pending oid[];
  v_still   oid[];
  v_round   int;
  v_now     int;
  v_pass    int;
  v_count   int;
BEGIN
  PERFORM set_config('search_path', 'pg_catalog', true);
  -- El SQL Editor de Supabase impone un statement_timeout corto y este bloque
  -- puede tardar minutos en un schema grande. Se anula solo para esta transacción.
  PERFORM set_config('statement_timeout', '0', true);

  -- ---------------------------------------------------------------- guardas
  IF v_src = v_tgt THEN
    RAISE EXCEPTION 'origen y destino no pueden ser el mismo schema (%)', v_src;
  END IF;
  IF v_tgt IN ('public','auth','storage','graphql','graphql_public','realtime','extensions','vault','pg_catalog','information_schema') THEN
    RAISE EXCEPTION 'destino reservado: %', v_tgt;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = v_src) THEN
    RAISE EXCEPTION 'el schema origen "%" no existe — verificalo con 00_diagnostico_schema_origen.sql', v_src;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = v_tgt) THEN
    RAISE EXCEPTION 'el schema destino "%" ya existe. Si querés rehacerlo: DROP SCHEMA %I CASCADE;', v_tgt, v_tgt;
  END IF;

  SELECT coalesce(array_agg(c.relname::text ORDER BY c.relname), '{}')
  INTO v_tables
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = v_src AND c.relkind = 'r';

  IF coalesce(cardinality(v_tables), 0) = 0 THEN
    RAISE EXCEPTION 'el schema origen "%" no tiene tablas', v_src;
  END IF;
  RAISE NOTICE 'clon: % tablas a copiar desde %', cardinality(v_tables), v_src;

  -- --------------------------------------------------------------- 1. schema
  EXECUTE format('CREATE SCHEMA %I', v_tgt);
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO postgres, anon, authenticated, service_role', v_tgt);

  -- ----------------------------------------------------------- 2. secuencias
  -- (las secuencias de columnas IDENTITY las crea solo el CREATE TABLE ... LIKE)
  FOR r IN
    SELECT c.relname::text AS seqname, s.seqstart, s.seqincrement, s.seqmin, s.seqmax, s.seqcache, s.seqcycle
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_sequence s ON s.seqrelid = c.oid
    WHERE n.nspname = v_src
      AND c.relkind = 'S'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype IN ('i','a')
      )
  LOOP
    EXECUTE format(
      'CREATE SEQUENCE %I.%I START %s INCREMENT %s MINVALUE %s MAXVALUE %s CACHE %s %s',
      v_tgt, r.seqname, r.seqstart, r.seqincrement, r.seqmin, r.seqmax, r.seqcache,
      CASE WHEN r.seqcycle THEN 'CYCLE' ELSE 'NO CYCLE' END
    );
  END LOOP;

  -- -------------------------------------------------------------- 3. tablas
  FOREACH tbl IN ARRAY v_tables
  LOOP
    EXECUTE format(
      'CREATE TABLE %I.%I (LIKE %I.%I INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY '
      || 'INCLUDING STATISTICS INCLUDING STORAGE INCLUDING COMMENTS EXCLUDING CONSTRAINTS EXCLUDING INDEXES)',
      v_tgt, tbl, v_src, tbl
    );
  END LOOP;

  -- 3b. defaults que apuntaban a objetos del origen (p. ej. nextval de secuencia)
  FOR r IN
    SELECT c.relname::text AS tablename, a.attname::text AS colname,
           pg_get_expr(ad.adbin, ad.adrelid) AS expr
    FROM pg_attrdef ad
    JOIN pg_class c ON c.oid = ad.adrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
    WHERE n.nspname = v_tgt
  LOOP
    def := regexp_replace(r.expr, '(?<![a-zA-Z0-9_])' || v_src || '(?![a-zA-Z0-9_])', v_tgt, 'g');
    IF def IS DISTINCT FROM r.expr THEN
      EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT %s', v_tgt, r.tablename, r.colname, def);
    END IF;
  END LOOP;

  -- ------------------------------------------------- 4. PK / UNIQUE / CHECK
  FOR r IN
    SELECT c.oid, c.conname::text AS conname, cf.relname::text AS relname, c.contype::text AS ctype
    FROM pg_constraint c
    JOIN pg_class cf ON cf.oid = c.conrelid
    JOIN pg_namespace nf ON nf.oid = cf.relnamespace
    WHERE nf.nspname = v_src AND c.contype IN ('p','u','c')
    ORDER BY CASE c.contype WHEN 'p' THEN 1 WHEN 'u' THEN 2 ELSE 3 END, c.conname
  LOOP
    def := regexp_replace(pg_get_constraintdef(r.oid), '(?<![a-zA-Z0-9_])' || v_src || '(?![a-zA-Z0-9_])', v_tgt, 'g');
    BEGIN
      EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s', v_tgt, r.relname, r.conname, def);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'clon: constraint %.% omitido: %', r.relname, r.conname, SQLERRM;
    END;
  END LOOP;

  -- ------------------------------------------------- 5. índices secundarios
  FOR r IN
    SELECT pg_get_indexdef(i.oid) AS idef
    FROM pg_class i
    JOIN pg_namespace n ON n.oid = i.relnamespace
    JOIN pg_index ix ON ix.indexrelid = i.oid
    JOIN pg_class t ON t.oid = ix.indrelid
    WHERE n.nspname = v_src
      AND i.relkind = 'i'
      AND ix.indisprimary IS FALSE
      AND NOT EXISTS (SELECT 1 FROM pg_constraint co WHERE co.conindid = i.oid)
      AND t.relkind = 'r'
  LOOP
    def := regexp_replace(r.idef, '(?<![a-zA-Z0-9_])' || v_src || '(?![a-zA-Z0-9_])', v_tgt, 'g');
    BEGIN
      EXECUTE def;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'clon: índice omitido: %', SQLERRM;
    END;
  END LOOP;

  -- ------------------------------------------------------- 6. foreign keys
  FOR r IN
    SELECT c.oid, c.conname::text AS conname, cf.relname::text AS from_table
    FROM pg_constraint c
    JOIN pg_class cf ON cf.oid = c.conrelid
    JOIN pg_namespace nf ON nf.oid = cf.relnamespace
    WHERE nf.nspname = v_src AND c.contype = 'f'
    ORDER BY c.conname
  LOOP
    def := regexp_replace(pg_get_constraintdef(r.oid), '(?<![a-zA-Z0-9_])' || v_src || '(?![a-zA-Z0-9_])', v_tgt, 'g');
    BEGIN
      EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s', v_tgt, r.from_table, r.conname, def);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'clon: FK %.% omitida: %', r.from_table, r.conname, SQLERRM;
    END;
  END LOOP;

  -- ------------------------------------------- 7. funciones — 1ra pasada
  -- (antes de vistas/triggers/policies, que las referencian).
  -- Se retienen SOLO las que fallan y se reintentan esas: una función ya creada
  -- no se vuelve a ejecutar. Con `CREATE OR REPLACE` un reintento ciego siempre
  -- "tiene éxito", así que contar éxitos nunca cortaría el bucle.
  SELECT coalesce(array_agg(p.oid), '{}')
  INTO v_pending
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = v_src
    AND p.prokind IN ('f','p')
    AND l.lanname IN ('plpgsql','sql');

  FOR v_round IN 1..25
  LOOP
    EXIT WHEN coalesce(cardinality(v_pending), 0) = 0;
    v_now := 0;
    v_still := '{}';
    FOREACH fn_oid IN ARRAY v_pending
    LOOP
      BEGIN
        fdef := pg_get_functiondef(fn_oid);
      EXCEPTION WHEN OTHERS THEN
        CONTINUE;  -- función no representable: se descarta
      END;
      CONTINUE WHEN fdef IS NULL;
      fdef := regexp_replace(fdef, '(?<![a-zA-Z0-9_])' || v_src || '(?![a-zA-Z0-9_])', v_tgt, 'g');
      BEGIN
        EXECUTE fdef;
        v_now := v_now + 1;
      EXCEPTION WHEN OTHERS THEN
        v_still := v_still || fn_oid;  -- dependencia pendiente: próxima ronda
      END;
    END LOOP;
    v_pending := v_still;
    EXIT WHEN v_now = 0;  -- ninguna avanzó: el resto espera a las vistas
  END LOOP;

  SELECT count(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = v_tgt;
  RAISE NOTICE 'clon: % funciones creadas en % (pendientes: %)',
    v_count, v_tgt, coalesce(cardinality(v_pending), 0);

  -- -------------------------------------------------------- 8. vistas (deps)
  FOR v_pass IN 1..15
  LOOP
    -- corte temprano: si ya están todas creadas, no hace falta otra pasada
    EXIT WHEN (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = v_src AND c.relkind = 'v')
            = (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = v_tgt AND c.relkind = 'v');
    FOR r IN
      SELECT c.relname::text AS vname
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = v_src AND c.relkind = 'v'
    LOOP
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM pg_class c2 JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
        WHERE n2.nspname = v_tgt AND c2.relname = r.vname AND c2.relkind = 'v'
      );
      SELECT pg_get_viewdef(format('%I.%I', v_src, r.vname)::regclass, true) INTO v_viewdef;
      CONTINUE WHEN v_viewdef IS NULL;
      v_viewdef := rtrim(btrim(v_viewdef), ';');  -- pg_get_viewdef cierra con ';'
      v_viewdef := regexp_replace(v_viewdef, '(?<![a-zA-Z0-9_])' || v_src || '(?![a-zA-Z0-9_])', v_tgt, 'g');
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s', v_tgt, r.vname, v_viewdef);
      EXCEPTION WHEN OTHERS THEN
        NULL;  -- dependencia pendiente: próxima pasada
      END;
    END LOOP;
  END LOOP;

  -- --------------------------------------------- 9. vistas materializadas
  FOR v_pass IN 1..10
  LOOP
    EXIT WHEN (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = v_src AND c.relkind = 'm')
            = (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = v_tgt AND c.relkind = 'm');
    FOR r IN
      SELECT c.relname::text AS mname
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = v_src AND c.relkind = 'm'
    LOOP
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM pg_class c2 JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
        WHERE n2.nspname = v_tgt AND c2.relname = r.mname
      );
      SELECT pg_get_viewdef(format('%I.%I', v_src, r.mname)::regclass, true) INTO v_viewdef;
      CONTINUE WHEN v_viewdef IS NULL;
      v_viewdef := rtrim(btrim(v_viewdef), ';');  -- si no, 'WITH NO DATA' queda tras el ';'
      v_viewdef := regexp_replace(v_viewdef, '(?<![a-zA-Z0-9_])' || v_src || '(?![a-zA-Z0-9_])', v_tgt, 'g');
      BEGIN
        EXECUTE format('CREATE MATERIALIZED VIEW %I.%I AS %s WITH NO DATA', v_tgt, r.mname, v_viewdef);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END LOOP;

  -- ----------------------- 10. funciones — 2da pasada: SOLO las que quedaron
  -- pendientes arriba (típicamente las que dependen de una vista).
  FOR v_round IN 1..25
  LOOP
    EXIT WHEN coalesce(cardinality(v_pending), 0) = 0;
    v_now := 0;
    v_still := '{}';
    FOREACH fn_oid IN ARRAY v_pending
    LOOP
      BEGIN
        fdef := pg_get_functiondef(fn_oid);
      EXCEPTION WHEN OTHERS THEN
        CONTINUE;
      END;
      CONTINUE WHEN fdef IS NULL;
      fdef := regexp_replace(fdef, '(?<![a-zA-Z0-9_])' || v_src || '(?![a-zA-Z0-9_])', v_tgt, 'g');
      BEGIN
        EXECUTE fdef;
        v_now := v_now + 1;
      EXCEPTION WHEN OTHERS THEN
        v_still := v_still || fn_oid;
      END;
    END LOOP;
    v_pending := v_still;
    EXIT WHEN v_now = 0;
  END LOOP;

  SELECT count(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = v_tgt;
  RAISE NOTICE 'clon: % funciones en % (no recreables: %)',
    v_count, v_tgt, coalesce(cardinality(v_pending), 0);

  -- ------------------------------------------------------------ 11. triggers
  FOR r IN
    SELECT tg.tgname::text AS tgname, c.relname::text AS tablename,
           pg_get_triggerdef(tg.oid, true) AS tdef
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = v_src AND NOT tg.tgisinternal AND c.relkind = 'r'
  LOOP
    def := regexp_replace(r.tdef, '(?<![a-zA-Z0-9_])' || v_src || '(?![a-zA-Z0-9_])', v_tgt, 'g');
    BEGIN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I', r.tgname, v_tgt, r.tablename);
      EXECUTE def;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'clon: trigger % en % omitido: %', r.tgname, r.tablename, SQLERRM;
    END;
  END LOOP;

  -- -------------------------------------------------------- 12. RLS + policies
  FOREACH tbl IN ARRAY v_tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = v_src AND c.relname = tbl AND c.relrowsecurity
    ) THEN
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', v_tgt, tbl);
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = v_src AND c.relname = tbl AND c.relforcerowsecurity
    ) THEN
      EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', v_tgt, tbl);
    END IF;
  END LOOP;

  FOR r IN
    SELECT pol.polname::text AS polname, c.relname::text AS tablename,
           pol.polcmd::text AS cmd, pol.polpermissive AS permissive,
           pg_get_expr(pol.polqual, pol.polrelid) AS polqual,
           pg_get_expr(pol.polwithcheck, pol.polrelid) AS polwithcheck,
           ARRAY(SELECT rolname::text FROM pg_roles WHERE oid = ANY (pol.polroles)) AS roles
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = v_src
  LOOP
    BEGIN
      qual := regexp_replace(r.polqual,      '(?<![a-zA-Z0-9_])' || v_src || '(?![a-zA-Z0-9_])', v_tgt, 'g');
      chk  := regexp_replace(r.polwithcheck, '(?<![a-zA-Z0-9_])' || v_src || '(?![a-zA-Z0-9_])', v_tgt, 'g');

      IF r.roles IS NULL OR coalesce(cardinality(r.roles), 0) = 0 THEN
        roles_clause := '';
      ELSE
        roles_clause := ' TO ' || (SELECT string_agg(quote_ident(x), ', ') FROM unnest(r.roles) AS x);
      END IF;

      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.polname, v_tgt, r.tablename);

      IF r.cmd = 'r' THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I AS %s FOR SELECT%s USING (%s)',
          r.polname, v_tgt, r.tablename,
          CASE WHEN r.permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
          roles_clause, coalesce(qual, 'true'));
      ELSIF r.cmd = 'a' THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I AS %s FOR INSERT%s WITH CHECK (%s)',
          r.polname, v_tgt, r.tablename,
          CASE WHEN r.permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
          roles_clause, coalesce(chk, qual, 'true'));
      ELSIF r.cmd = 'w' THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I AS %s FOR UPDATE%s USING (%s) WITH CHECK (%s)',
          r.polname, v_tgt, r.tablename,
          CASE WHEN r.permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
          roles_clause, coalesce(qual, 'true'), coalesce(chk, qual, 'true'));
      ELSIF r.cmd = 'd' THEN
        EXECUTE format('CREATE POLICY %I ON %I.%I AS %s FOR DELETE%s USING (%s)',
          r.polname, v_tgt, r.tablename,
          CASE WHEN r.permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
          roles_clause, coalesce(qual, 'true'));
      ELSE  -- '*' = ALL
        EXECUTE format('CREATE POLICY %I ON %I.%I AS %s FOR ALL%s USING (%s) WITH CHECK (%s)',
          r.polname, v_tgt, r.tablename,
          CASE WHEN r.permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
          roles_clause, coalesce(qual, 'true'), coalesce(chk, qual, 'true'));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'clon: policy % en % omitida: %', r.polname, r.tablename, SQLERRM;
    END;
  END LOOP;

  -- ------------------------------------------------------------- 13. grants
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', v_tgt);
  EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA %I TO postgres, service_role', v_tgt);
  EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO authenticated', v_tgt);
  EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA %I TO postgres, service_role', v_tgt);
  EXECUTE format('GRANT EXECUTE ON ALL ROUTINES IN SCHEMA %I TO authenticated, service_role', v_tgt);
  EXECUTE format('GRANT ALL ON ALL ROUTINES IN SCHEMA %I TO postgres, service_role', v_tgt);

  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated', v_tgt);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I GRANT ALL ON TABLES TO postgres, service_role', v_tgt);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO authenticated', v_tgt);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I GRANT EXECUTE ON ROUTINES TO authenticated, service_role', v_tgt);

  -- ----------------------------------------------------------- 14. realtime
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = v_pub) THEN
    FOR r IN
      SELECT pt.tablename::text AS tablename
      FROM pg_publication_tables pt
      WHERE pt.pubname = v_pub AND pt.schemaname = v_src
    LOOP
      BEGIN
        EXECUTE format('ALTER PUBLICATION %I ADD TABLE %I.%I', v_pub, v_tgt, r.tablename);
      EXCEPTION WHEN duplicate_object THEN NULL;
      WHEN OTHERS THEN RAISE NOTICE 'clon: realtime % omitido: %', r.tablename, SQLERRM;
      END;
    END LOOP;
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE 'clon: LISTO. Schema % creado a partir de % (sin datos).', v_tgt, v_src;
END;
$clone$;
