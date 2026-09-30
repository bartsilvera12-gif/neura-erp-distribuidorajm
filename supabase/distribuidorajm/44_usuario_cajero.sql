-- =============================================================================
-- 44 · USUARIO DE SOLO CAJA: caja@distribuidorajm.com
-- =============================================================================
-- Deja al usuario con rol `cajero` y con UN solo módulo: `ventas` (la caja).
-- Con ese rol el ERP le saca el sidebar (y la barra de abajo en el celular),
-- entra directo a la caja y cualquier otra pantalla lo devuelve ahí. Puede
-- abrir y cerrar su caja, cobrar, imprimir factura / ticket / recibo y ver su
-- arqueo. "Cerrar sesión" sigue en el menú de arriba a la derecha.
--
-- Toca `distribuidorajmerp` y, si el login todavía no existe, crea el usuario
-- en `auth` (el login de Supabase, igual que el 03 con el admin). Si el login
-- ya existe, NO le cambia la contraseña.
--
-- ANTES DE EJECUTAR: poner la contraseña en v_password.
-- Idempotente: se puede volver a correr.
-- =============================================================================

DO $cajero$
DECLARE
  ---------------------------------------------------------------------------
  v_email      text := 'caja@distribuidorajm.com';
  v_nombre     text := 'Caja';
  v_password   text := 'CAMBIAR';   -- <<<<<< PONER LA CONTRASEÑA ANTES DE EJECUTAR
  v_empresa_id uuid := '058efef5-e1b5-4cab-8a65-238f81823917';
  ---------------------------------------------------------------------------
  v_auth_id      uuid;
  v_usuario_id   uuid;
  v_modulo_id    uuid;
  v_crypt_schema text;
  v_cols         text;
  v_vals         text;
  v_faltan       text;
  v_payload      jsonb;
BEGIN
  IF v_password = 'CAMBIAR' OR length(v_password) < 8 THEN
    RAISE EXCEPTION 'Poné una contraseña de al menos 8 caracteres en v_password. No se hizo nada.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM distribuidorajmerp.empresas WHERE id = v_empresa_id) THEN
    RAISE EXCEPTION 'No encontré la empresa %. No se hizo nada.', v_empresa_id;
  END IF;

  SELECT id INTO v_modulo_id
    FROM distribuidorajmerp.modulos
   WHERE lower(btrim(slug)) = 'ventas'
   LIMIT 1;
  IF v_modulo_id IS NULL THEN
    RAISE EXCEPTION 'No encontré el módulo "ventas" en el catálogo. No se hizo nada.';
  END IF;

  -- ------------------------------------------------------- 1. login (auth)
  SELECT id INTO v_auth_id FROM auth.users WHERE lower(email) = lower(v_email);
  IF v_auth_id IS NULL THEN
    SELECT n.nspname INTO v_crypt_schema
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.proname = 'crypt' AND p.pronargs = 2
     ORDER BY CASE n.nspname WHEN 'extensions' THEN 1 WHEN 'public' THEN 2 ELSE 3 END
     LIMIT 1;
    IF v_crypt_schema IS NULL THEN
      RAISE EXCEPTION 'Falta pgcrypto (función crypt). No se hizo nada.';
    END IF;

    v_auth_id := gen_random_uuid();
    EXECUTE format($q$
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', %L, 'authenticated', 'authenticated',
        %L, %I.crypt(%L, %I.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('nombre', %L), now(), now()
      )$q$,
      v_auth_id, lower(v_email), v_crypt_schema, v_password, v_crypt_schema, v_nombre);

    -- GoTrue necesita la identity para entrar con email y contraseña.
    IF to_regclass('auth.identities') IS NOT NULL THEN
      BEGIN
        EXECUTE format($q$
          INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
          VALUES (gen_random_uuid(), %L, %L, jsonb_build_object('sub', %L, 'email', %L, 'email_verified', true),
                  'email', now(), now(), now())$q$,
          v_auth_id, v_auth_id::text, v_auth_id::text, lower(v_email));
      EXCEPTION WHEN undefined_column THEN
        -- Versiones viejas de GoTrue no tienen provider_id.
        EXECUTE format($q$
          INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
          VALUES (gen_random_uuid(), %L, jsonb_build_object('sub', %L, 'email', %L), 'email', now(), now(), now())$q$,
          v_auth_id, v_auth_id::text, lower(v_email));
      END;
    END IF;
    RAISE NOTICE 'login: % creado', v_email;
  ELSE
    RAISE NOTICE 'login: % ya existía, no se tocó la contraseña', v_email;
  END IF;

  -- ----------------------------------------------------- 2. usuario del ERP
  SELECT id INTO v_usuario_id
    FROM distribuidorajmerp.usuarios
   WHERE lower(btrim(email)) = lower(v_email)
   LIMIT 1;

  IF v_usuario_id IS NULL THEN
    v_usuario_id := gen_random_uuid();
    v_payload := jsonb_build_object(
      'id',           v_usuario_id::text,
      'auth_user_id', v_auth_id::text,
      'empresa_id',   v_empresa_id::text,
      'email',        lower(v_email),
      'nombre',       v_nombre,
      'rol',          'cajero',
      'activo',       'true',
      'created_at',   now()::text,
      'updated_at',   now()::text
    );
    -- Solo las columnas que la tabla tiene, con su tipo.
    SELECT string_agg(quote_ident(k), ', ' ORDER BY k),
           string_agg(format('%L::%s', v_payload ->> k, a.atttypid::regtype::text), ', ' ORDER BY k)
      INTO v_cols, v_vals
      FROM jsonb_object_keys(v_payload) AS k
      JOIN pg_attribute a ON a.attname = k
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'distribuidorajmerp' AND c.relname = 'usuarios'
       AND a.attnum > 0 AND NOT a.attisdropped;

    SELECT string_agg(a.attname, ', ') INTO v_faltan
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
     WHERE n.nspname = 'distribuidorajmerp' AND c.relname = 'usuarios'
       AND a.attnum > 0 AND NOT a.attisdropped AND a.attnotnull
       AND ad.adbin IS NULL AND a.attidentity = ''
       AND NOT (v_payload ? a.attname);
    IF v_faltan IS NOT NULL THEN
      RAISE EXCEPTION 'usuarios tiene columnas obligatorias que este script no completa: %. No se hizo nada.', v_faltan;
    END IF;

    EXECUTE format('INSERT INTO distribuidorajmerp.usuarios (%s) VALUES (%s)', v_cols, v_vals);
    RAISE NOTICE 'usuario: % creado con rol cajero', v_email;
  ELSE
    UPDATE distribuidorajmerp.usuarios
       SET rol = 'cajero', empresa_id = v_empresa_id
     WHERE id = v_usuario_id;
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'distribuidorajmerp' AND table_name = 'usuarios'
                  AND column_name = 'auth_user_id') THEN
      EXECUTE 'UPDATE distribuidorajmerp.usuarios SET auth_user_id = $1 WHERE id = $2'
        USING v_auth_id, v_usuario_id;
    END IF;
    RAISE NOTICE 'usuario: % ya existía, quedó con rol cajero', v_email;
  END IF;

  -- ------------------------------------------------ 3. solo el módulo ventas
  -- Sin filas en usuario_modulos el ERP le daría TODOS los módulos de la
  -- empresa: por eso se deja exactamente una.
  DELETE FROM distribuidorajmerp.usuario_modulos
   WHERE usuario_id = v_usuario_id AND modulo_id <> v_modulo_id;
  INSERT INTO distribuidorajmerp.usuario_modulos (usuario_id, modulo_id)
  SELECT v_usuario_id, v_modulo_id
   WHERE NOT EXISTS (SELECT 1 FROM distribuidorajmerp.usuario_modulos
                      WHERE usuario_id = v_usuario_id AND modulo_id = v_modulo_id);

  PERFORM pg_notify('pgrst', 'reload schema');
END;
$cajero$;

-- Control: el usuario, su rol y sus módulos (tiene que salir solo "ventas").
SELECT u.email, u.rol, m.slug AS modulo
  FROM distribuidorajmerp.usuarios u
  LEFT JOIN distribuidorajmerp.usuario_modulos um ON um.usuario_id = u.id
  LEFT JOIN distribuidorajmerp.modulos m ON m.id = um.modulo_id
 WHERE lower(u.email) = 'caja@distribuidorajm.com';
