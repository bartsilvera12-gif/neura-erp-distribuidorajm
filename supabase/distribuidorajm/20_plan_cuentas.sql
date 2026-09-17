-- ============================================================================
-- 20. Plan de Cuentas y Configuración Contable
-- ============================================================================
--
-- Síntoma: en Configuración → Contable los campos no se pueden completar. No es
-- que el formulario esté roto: los selectores se llenan con las cuentas del plan
-- de cuentas, y `plan_cuentas` no existe en este schema. El endpoint que las
-- lista devuelve 500, la pantalla recibe una lista vacía y no hay nada que
-- elegir en ningún campo.
--
-- Esto crea las dos tablas que faltan y siembra un plan de cuentas mínimo para
-- una distribuidora paraguaya, con las cuentas que los asientos automáticos
-- necesitan: IVA crédito y débito 10% y 5%, proveedores, clientes, caja, banco,
-- ventas gravadas y exentas.
--
-- ACLARACIÓN IMPORTANTE, porque cambia lo que hay que hacer después:
-- Gastos y Servicios NO necesita nada de esto. Se cambió en la migración 19
-- justamente para que funcione sin contabilidad: carga el comprobante y el IVA
-- y no arma asientos. Si Gastos sigue fallando, no es por el plan de cuentas.
--
-- Alcance: SOLO el schema `distribuidorajmerp`. No toca `public` ni ningún otro.
-- Idempotente: se puede correr de nuevo sin duplicar cuentas ni pisar la
-- configuración ya guardada.
-- ============================================================================

DO $$
DECLARE
  v_schema   text := 'distribuidorajmerp';
  v_empresa  uuid;
  v_creadas  text[] := ARRAY[]::text[];
  v_cuenta   record;
  v_padre    uuid;
  v_n        int := 0;

  -- cuenta | denominación | nivel | naturaleza (D deudora / A acreedora) | asentable
  v_plan text[][] := ARRAY[
    ARRAY['1',        'ACTIVO',                          '1', 'D', 'false'],
    ARRAY['1.1',      'ACTIVO CORRIENTE',                '2', 'D', 'false'],
    ARRAY['1.1.01',   'CAJA',                            '3', 'D', 'true'],
    ARRAY['1.1.02',   'BANCOS',                          '3', 'D', 'true'],
    ARRAY['1.1.03',   'CREDITOS POR VENTAS (CLIENTES)',  '3', 'D', 'true'],
    ARRAY['1.1.04',   'IVA CREDITO FISCAL 10%',          '3', 'D', 'true'],
    ARRAY['1.1.05',   'IVA CREDITO FISCAL 5%',           '3', 'D', 'true'],
    ARRAY['1.1.06',   'MERCADERIAS',                     '3', 'D', 'true'],
    ARRAY['2',        'PASIVO',                          '1', 'A', 'false'],
    ARRAY['2.1',      'PASIVO CORRIENTE',                '2', 'A', 'false'],
    ARRAY['2.1.01',   'PROVEEDORES',                     '3', 'A', 'true'],
    ARRAY['2.1.02',   'IVA DEBITO FISCAL 10%',           '3', 'A', 'true'],
    ARRAY['2.1.03',   'IVA DEBITO FISCAL 5%',            '3', 'A', 'true'],
    ARRAY['2.1.04',   'ANTICIPOS DE CLIENTES',           '3', 'A', 'true'],
    ARRAY['4',        'INGRESOS',                        '1', 'A', 'false'],
    ARRAY['4.1',      'VENTAS',                          '2', 'A', 'false'],
    ARRAY['4.1.01',   'VENTAS GRAVADAS 10%',             '3', 'A', 'true'],
    ARRAY['4.1.02',   'VENTAS GRAVADAS 5%',              '3', 'A', 'true'],
    ARRAY['4.1.03',   'VENTAS EXENTAS',                  '3', 'A', 'true'],
    ARRAY['4.1.04',   'VENTAS DE SERVICIOS',             '3', 'A', 'true'],
    ARRAY['5',        'EGRESOS',                         '1', 'D', 'false'],
    ARRAY['5.1',      'COSTOS Y GASTOS',                 '2', 'D', 'false'],
    ARRAY['5.1.01',   'COSTO DE MERCADERIAS VENDIDAS',   '3', 'D', 'true'],
    ARRAY['5.1.02',   'GASTOS OPERATIVOS',               '3', 'D', 'true'],
    ARRAY['5.1.03',   'COMBUSTIBLE Y MANTENIMIENTO',     '3', 'D', 'true'],
    ARRAY['5.1.04',   'SUELDOS Y JORNALES',              '3', 'D', 'true']
  ];
BEGIN
  -- ── La empresa ────────────────────────────────────────────────────────────
  EXECUTE format('SELECT id FROM %I.empresas ORDER BY created_at LIMIT 1', v_schema)
     INTO v_empresa;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'no encontré ninguna empresa en %', v_schema;
  END IF;
  RAISE NOTICE 'empresa: %', v_empresa;

  -- ── plan_cuentas ──────────────────────────────────────────────────────────
  -- Las columnas son exactamente las que leen `plan-cuentas.ts` y las consultas
  -- de contabilidad; una de menos y la pantalla vuelve a fallar.
  IF to_regclass(v_schema || '.plan_cuentas') IS NULL THEN
    EXECUTE format($f$
      CREATE TABLE %I.plan_cuentas (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id      uuid NOT NULL,
        cuenta          text NOT NULL,
        denominacion    text NOT NULL,
        nivel           integer NOT NULL DEFAULT 1,
        naturaleza      text NOT NULL DEFAULT 'D',
        asentable       boolean NOT NULL DEFAULT true,
        centro_costo    boolean NOT NULL DEFAULT false,
        moneda          text,
        tipo_cambio     numeric,
        cuenta_sset     text,
        cuenta_padre_id uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        activo          boolean NOT NULL DEFAULT true,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT plan_cuentas_naturaleza_ck CHECK (naturaleza IN ('D', 'A')),
        -- El código de cuenta es único dentro de la empresa: es con lo que se
        -- identifica una cuenta en cualquier listado contable.
        CONSTRAINT plan_cuentas_codigo_unico UNIQUE (empresa_id, cuenta)
      )
    $f$, v_schema, v_schema);

    EXECUTE format('CREATE INDEX idx_plan_cuentas_empresa ON %I.plan_cuentas (empresa_id, cuenta)', v_schema);
    EXECUTE format('CREATE INDEX idx_plan_cuentas_asentables ON %I.plan_cuentas (empresa_id, activo, asentable)', v_schema);

    v_creadas := v_creadas || 'plan_cuentas'::text;
  END IF;

  -- ── configuracion_contable ────────────────────────────────────────────────
  -- Una fila por empresa: el guardado hace ON CONFLICT (empresa_id), así que la
  -- unicidad tiene que existir o el PUT falla.
  IF to_regclass(v_schema || '.configuracion_contable') IS NULL THEN
    EXECUTE format($f$
      CREATE TABLE %I.configuracion_contable (
        id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id                    uuid NOT NULL UNIQUE,
        cuenta_iva_credito_5_id       uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        cuenta_iva_credito_10_id      uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        cuenta_proveedores_id         uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        cuenta_caja_id                uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        cuenta_banco_id               uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        cuenta_iva_debito_5_id        uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        cuenta_iva_debito_10_id       uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        cuenta_ventas_gravadas_id     uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        cuenta_ventas_exentas_id      uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        cuenta_ventas_servicios_id    uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        cuenta_clientes_id            uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        cuenta_anticipos_clientes_id  uuid REFERENCES %I.plan_cuentas(id) ON DELETE SET NULL,
        updated_by                    uuid,
        created_at                    timestamptz NOT NULL DEFAULT now(),
        updated_at                    timestamptz NOT NULL DEFAULT now()
      )
    $f$, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema, v_schema,
         v_schema, v_schema, v_schema, v_schema, v_schema, v_schema);

    v_creadas := v_creadas || 'configuracion_contable'::text;
  END IF;

  -- ── Períodos contables ────────────────────────────────────────────────────
  -- La misma pantalla lista y abre/cierra períodos. Sin la tabla, esa mitad
  -- queda muerta aunque las cuentas ya carguen.
  IF to_regclass(v_schema || '.periodos_contables') IS NULL THEN
    EXECUTE format($f$
      CREATE TABLE %I.periodos_contables (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id  uuid NOT NULL,
        anio        integer NOT NULL,
        mes         integer NOT NULL,
        fecha_desde date,
        fecha_hasta date,
        estado      text NOT NULL DEFAULT 'abierto',
        cerrado_at  timestamptz,
        cerrado_by  uuid,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT periodos_contables_estado_ck CHECK (estado IN ('abierto', 'cerrado')),
        CONSTRAINT periodos_contables_mes_ck CHECK (mes BETWEEN 1 AND 12),
        CONSTRAINT periodos_contables_unico UNIQUE (empresa_id, anio, mes)
      )
    $f$, v_schema);
    v_creadas := v_creadas || 'periodos_contables'::text;
  END IF;

  -- ── Siembra del plan ──────────────────────────────────────────────────────
  -- Dos pasadas: primero todas las cuentas, después el padre, así no importa el
  -- orden y volver a correrlo no duplica nada.
  FOR i IN 1 .. array_length(v_plan, 1) LOOP
    EXECUTE format(
      'INSERT INTO %I.plan_cuentas (empresa_id, cuenta, denominacion, nivel, naturaleza, asentable) '
      || 'VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (empresa_id, cuenta) DO NOTHING',
      v_schema)
    USING v_empresa, v_plan[i][1], v_plan[i][2], v_plan[i][3]::int, v_plan[i][4], v_plan[i][5]::boolean;
    v_n := v_n + 1;
  END LOOP;

  -- El padre de "1.1.01" es "1.1"; el de "1.1" es "1"; el de "1" no tiene.
  EXECUTE format($f$
    UPDATE %I.plan_cuentas h
       SET cuenta_padre_id = p.id
      FROM %I.plan_cuentas p
     WHERE h.empresa_id = $1
       AND p.empresa_id = $1
       AND h.cuenta_padre_id IS NULL
       AND position('.' in h.cuenta) > 0
       AND p.cuenta = left(h.cuenta, length(h.cuenta) - position('.' in reverse(h.cuenta)))
  $f$, v_schema, v_schema) USING v_empresa;

  -- ── Configuración por defecto ─────────────────────────────────────────────
  -- Se deja apuntando a las cuentas recién sembradas, pero SIN pisar lo que ya
  -- estuviera elegido: COALESCE deja lo cargado a mano donde esté.
  EXECUTE format(
    'INSERT INTO %I.configuracion_contable (empresa_id) VALUES ($1) ON CONFLICT (empresa_id) DO NOTHING',
    v_schema) USING v_empresa;

  FOR v_cuenta IN
    SELECT * FROM (VALUES
      ('cuenta_caja_id',               '1.1.01'),
      ('cuenta_banco_id',              '1.1.02'),
      ('cuenta_clientes_id',           '1.1.03'),
      ('cuenta_iva_credito_10_id',     '1.1.04'),
      ('cuenta_iva_credito_5_id',      '1.1.05'),
      ('cuenta_proveedores_id',        '2.1.01'),
      ('cuenta_iva_debito_10_id',      '2.1.02'),
      ('cuenta_iva_debito_5_id',       '2.1.03'),
      ('cuenta_anticipos_clientes_id', '2.1.04'),
      ('cuenta_ventas_gravadas_id',    '4.1.01'),
      ('cuenta_ventas_exentas_id',     '4.1.03'),
      ('cuenta_ventas_servicios_id',   '4.1.04')
    ) AS t(campo, cuenta)
  LOOP
    EXECUTE format($f$
      UPDATE %I.configuracion_contable c
         SET %I = COALESCE(c.%I, (SELECT id FROM %I.plan_cuentas
                                   WHERE empresa_id = $1 AND cuenta = $2)),
             updated_at = now()
       WHERE c.empresa_id = $1
    $f$, v_schema, v_cuenta.campo, v_cuenta.campo, v_schema)
    USING v_empresa, v_cuenta.cuenta;
  END LOOP;

  -- ── RLS ───────────────────────────────────────────────────────────────────
  -- Prendida y sin policies: el ERP entra con la service role, que la saltea.
  -- Sin esto, la clave anónima podría leer el plan de cuentas desde afuera,
  -- porque el schema está expuesto en PostgREST.
  EXECUTE format('ALTER TABLE %I.plan_cuentas ENABLE ROW LEVEL SECURITY', v_schema);
  EXECUTE format('ALTER TABLE %I.configuracion_contable ENABLE ROW LEVEL SECURITY', v_schema);
  EXECUTE format('ALTER TABLE %I.periodos_contables ENABLE ROW LEVEL SECURITY', v_schema);

  IF array_length(v_creadas, 1) IS NULL THEN
    RAISE NOTICE 'las tablas ya existían; se revisó la siembra (% cuentas).', v_n;
  ELSE
    RAISE NOTICE 'creadas: %. Cuentas sembradas/revisadas: %.', array_to_string(v_creadas, ', '), v_n;
  END IF;
END;
$$;

-- ── Permisos: se copian de una tabla que el ERP ya usa ─────────────────────
-- Una tabla nueva nace sin GRANT para nadie; sin esto, "permission denied".
DO $$
DECLARE
  v_schema text := 'distribuidorajmerp';
  v_modelo text;
  v_nuevas text[] := ARRAY['plan_cuentas', 'configuracion_contable', 'periodos_contables'];
  v_tabla  text;
  r        record;
  v_n      int := 0;
BEGIN
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

  FOREACH v_tabla IN ARRAY v_nuevas LOOP
    CONTINUE WHEN to_regclass(v_schema || '.' || v_tabla) IS NULL;
    FOR r IN
      SELECT DISTINCT grantee, privilege_type
        FROM information_schema.role_table_grants
       WHERE table_schema = v_schema AND table_name = v_modelo AND grantee <> 'PUBLIC'
    LOOP
      EXECUTE format('GRANT %s ON TABLE %I.%I TO %I', r.privilege_type, v_schema, v_tabla, r.grantee);
      v_n := v_n + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'otorgados % permisos (modelo: %).', v_n, v_modelo;
END;
$$;

-- PostgREST cachea el schema: sin esto sigue diciendo que las tablas no existen.
NOTIFY pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────────
-- 1) El plan sembrado. Las asentables son las que aparecen en los selectores.
SELECT cuenta, denominacion, nivel, naturaleza,
       CASE WHEN asentable THEN 'sí' ELSE 'no (agrupadora)' END AS se_puede_elegir
  FROM distribuidorajmerp.plan_cuentas
 ORDER BY cuenta;

-- 2) Qué quedó configurado. Todas deberían tener cuenta; ninguna en NULL.
SELECT 'caja' AS campo, p.cuenta, p.denominacion
  FROM distribuidorajmerp.configuracion_contable c
  LEFT JOIN distribuidorajmerp.plan_cuentas p ON p.id = c.cuenta_caja_id
UNION ALL SELECT 'clientes', p.cuenta, p.denominacion
  FROM distribuidorajmerp.configuracion_contable c
  LEFT JOIN distribuidorajmerp.plan_cuentas p ON p.id = c.cuenta_clientes_id
UNION ALL SELECT 'proveedores', p.cuenta, p.denominacion
  FROM distribuidorajmerp.configuracion_contable c
  LEFT JOIN distribuidorajmerp.plan_cuentas p ON p.id = c.cuenta_proveedores_id
UNION ALL SELECT 'iva debito 10', p.cuenta, p.denominacion
  FROM distribuidorajmerp.configuracion_contable c
  LEFT JOIN distribuidorajmerp.plan_cuentas p ON p.id = c.cuenta_iva_debito_10_id
UNION ALL SELECT 'ventas gravadas', p.cuenta, p.denominacion
  FROM distribuidorajmerp.configuracion_contable c
  LEFT JOIN distribuidorajmerp.plan_cuentas p ON p.id = c.cuenta_ventas_gravadas_id;
