-- ============================================================================
-- 23. Lo que le falta al schema para que Comisiones funcione
-- ============================================================================
--
-- Síntoma: "column facturas.comisionable does not exist" al entrar a Comisiones
-- con la política ya cargada.
--
-- Vengo arreglando esto de a una columna por vez y cada corrida destapa la
-- siguiente. Así que esta migración NO va detrás del error puntual: toma la
-- lista completa de tablas y columnas que el módulo Comisiones lee, agrega todo
-- lo que falte, y al final imprime el estado de cada una. Si algo sigue en
-- rojo, se ve en esa lista y no hace falta otra vuelta.
--
-- Qué es cada cosa:
--   · facturas.comisionable        → si esa factura genera comisión.
--   · facturas.vendedor_usuario_id → quién se la lleva (si no, el del cliente).
--   · nota_credito                 → las NC se restan de la base comisionable.
--   · comision_overrides           → incluir o excluir un pago a mano.
--
-- NO cambia ningún dato existente. Las facturas que ya están quedan con
-- `comisionable` en NULL, que el código lee como "decidilo con la regla
-- automática", que es exactamente lo que pasaba hasta ahora.
--
-- Alcance: SOLO el schema `distribuidorajmerp`. No toca `public` ni ningún otro.
-- Idempotente: volver a correrlo no agrega nada ni cambia un solo dato.
-- ============================================================================

-- ── 1. Columnas ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_schema    text := 'distribuidorajmerp';
  v_agregadas text[] := ARRAY[]::text[];
  v_col       record;
BEGIN
  FOR v_col IN
    SELECT * FROM (VALUES
      -- facturas: la base del cálculo.
      ('facturas', 'comisionable',         'boolean'),
      ('facturas', 'vendedor_usuario_id',  'uuid'),
      ('facturas', 'suscripcion_id',       'uuid'),
      ('facturas', 'tipo',                 'text'),
      ('facturas', 'saldo',                'numeric'),
      ('facturas', 'moneda',               'text'),
      -- clientes: de acá sale el vendedor cuando la factura no lo trae.
      ('clientes', 'vendedor_usuario_id',  'uuid'),
      ('clientes', 'vendedor_asignado',    'text')
    ) AS t(tabla, campo, tipo)
  LOOP
    CONTINUE WHEN to_regclass(v_schema || '.' || v_col.tabla) IS NULL;
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = v_schema AND table_name = v_col.tabla
         AND column_name = v_col.campo
    );
    EXECUTE format('ALTER TABLE %I.%I ADD COLUMN %I %s',
                   v_schema, v_col.tabla, v_col.campo, v_col.tipo);
    v_agregadas := v_agregadas || (v_col.tabla || '.' || v_col.campo)::text;
  END LOOP;

  IF array_length(v_agregadas, 1) IS NULL THEN
    RAISE NOTICE 'columnas: no faltaba ninguna.';
  ELSE
    RAISE NOTICE 'columnas agregadas: %', array_to_string(v_agregadas, ', ');
  END IF;
END;
$$;

-- ── 2. Tablas ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_schema  text := 'distribuidorajmerp';
  v_creadas text[] := ARRAY[]::text[];
BEGIN
  -- Notas de crédito. El cálculo las resta de la base: una factura de 100 con
  -- una NC de 30 comisiona sobre 70, no sobre 100.
  IF to_regclass(v_schema || '.nota_credito') IS NULL THEN
    EXECUTE format($f$
      CREATE TABLE %I.nota_credito (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id   uuid NOT NULL,
        factura_id   uuid NOT NULL,
        monto        numeric NOT NULL DEFAULT 0,
        motivo       text,
        observacion_interna text,
        -- 'borrador' | 'aprobada' | 'anulada_borrador'. Solo las aprobadas
        -- restan: un borrador todavía no es nada.
        estado_erp   text NOT NULL DEFAULT 'borrador',
        moneda_snapshot text,
        monto_factura_snapshot numeric,
        saldo_previo_snapshot  numeric,
        suma_pagos_snapshot    numeric,
        created_at   timestamptz NOT NULL DEFAULT now(),
        created_by_user_id uuid,
        created_by_email_snapshot  text,
        created_by_nombre_snapshot text
      )
    $f$, v_schema);
    EXECUTE format('CREATE INDEX idx_nota_credito_factura ON %I.nota_credito (empresa_id, factura_id)', v_schema);
    v_creadas := v_creadas || 'nota_credito'::text;
  END IF;

  -- Overrides: incluir o excluir un pago puntual de la comisión de un período.
  IF to_regclass(v_schema || '.comision_overrides') IS NULL THEN
    EXECUTE format($f$
      CREATE TABLE %I.comision_overrides (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id  uuid NOT NULL,
        periodo_ym  text NOT NULL,
        ambito      text NOT NULL DEFAULT 'pago',
        pago_id     uuid,
        factura_id  uuid,
        decision    text NOT NULL,
        motivo      text,
        decidido_por       uuid,
        decidido_por_email text,
        decidido_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT comision_overrides_decision_ck CHECK (decision IN ('incluir', 'excluir')),
        -- Un pago, una decisión por período: el alta busca la existente y la
        -- actualiza, así que dos filas iguales serían una decisión ambigua.
        CONSTRAINT comision_overrides_unico UNIQUE (empresa_id, periodo_ym, ambito, pago_id)
      )
    $f$, v_schema);
    v_creadas := v_creadas || 'comision_overrides'::text;
  END IF;

  IF array_length(v_creadas, 1) IS NULL THEN
    RAISE NOTICE 'tablas: no faltaba ninguna.';
  ELSE
    RAISE NOTICE 'tablas creadas: %', array_to_string(v_creadas, ', ');
    EXECUTE format('ALTER TABLE %I.nota_credito ENABLE ROW LEVEL SECURITY', v_schema);
    EXECUTE format('ALTER TABLE %I.comision_overrides ENABLE ROW LEVEL SECURITY', v_schema);
  END IF;
END;
$$;

-- ── 3. Permisos de las tablas nuevas ───────────────────────────────────────
DO $$
DECLARE
  v_schema text := 'distribuidorajmerp';
  v_modelo text;
  v_tabla  text;
  r        record;
  v_n      int := 0;
BEGIN
  SELECT c.relname INTO v_modelo
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = v_schema AND c.relkind = 'r'
     AND c.relname IN ('ventas', 'clientes', 'productos', 'usuarios')
   ORDER BY array_position(ARRAY['ventas','clientes','productos','usuarios'], c.relname)
   LIMIT 1;
  IF v_modelo IS NULL THEN
    RAISE EXCEPTION 'no encontré una tabla de referencia en % para copiar permisos', v_schema;
  END IF;

  FOREACH v_tabla IN ARRAY ARRAY['nota_credito', 'comision_overrides'] LOOP
    CONTINUE WHEN to_regclass(v_schema || '.' || v_tabla) IS NULL;
    FOR r IN
      SELECT DISTINCT grantee, privilege_type FROM information_schema.role_table_grants
       WHERE table_schema = v_schema AND table_name = v_modelo AND grantee <> 'PUBLIC'
    LOOP
      EXECUTE format('GRANT %s ON TABLE %I.%I TO %I', r.privilege_type, v_schema, v_tabla, r.grantee);
      v_n := v_n + 1;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'otorgados % permisos (modelo: %).', v_n, v_modelo;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ── Verificación: TODO lo que Comisiones lee ───────────────────────────────
-- Cualquier fila que no diga "ok" es una consulta que va a seguir fallando.
WITH requerido(tabla, campo) AS (
  VALUES
    ('facturas','comisionable'), ('facturas','vendedor_usuario_id'),
    ('facturas','suscripcion_id'), ('facturas','tipo'), ('facturas','saldo'),
    ('facturas','moneda'), ('facturas','estado'), ('facturas','monto'),
    ('facturas','fecha'), ('facturas','cliente_id'), ('facturas','numero_factura'),
    ('facturas','estado_contable'),
    ('clientes','vendedor_usuario_id'), ('clientes','tipo_cliente'),
    ('clientes','nombre_contacto'), ('clientes','empresa'),
    ('pagos','factura_id'), ('pagos','monto'), ('pagos','fecha_pago'),
    ('pagos','estado_contable'),
    ('nota_credito','factura_id'), ('nota_credito','monto'), ('nota_credito','estado_erp'),
    ('comision_overrides','periodo_ym'), ('comision_overrides','ambito'),
    ('comision_overrides','pago_id'), ('comision_overrides','decision'),
    ('comision_politicas','base_calculo'), ('comision_escalas','porcentaje_comision')
)
SELECT r.tabla,
       r.campo,
       CASE
         WHEN to_regclass('distribuidorajmerp.' || r.tabla) IS NULL THEN '✗ falta la TABLA'
         WHEN EXISTS (SELECT 1 FROM information_schema.columns c
                       WHERE c.table_schema = 'distribuidorajmerp'
                         AND c.table_name = r.tabla AND c.column_name = r.campo)
           THEN 'ok'
         ELSE '✗ falta la columna'
       END AS estado
  FROM requerido r
 ORDER BY (CASE WHEN to_regclass('distribuidorajmerp.' || r.tabla) IS NULL
                  OR NOT EXISTS (SELECT 1 FROM information_schema.columns c
                                  WHERE c.table_schema = 'distribuidorajmerp'
                                    AND c.table_name = r.tabla AND c.column_name = r.campo)
                THEN 0 ELSE 1 END),
          r.tabla, r.campo;
