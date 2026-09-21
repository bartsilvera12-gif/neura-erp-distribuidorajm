-- ============================================================================
-- 25. Lo que le falta al schema para que Compras funcione
-- ============================================================================
--
-- Síntoma: las compras se registran pero el listado sale vacío ("No hay compras
-- registradas") y "Exportar Excel" tira 500.
--
-- Las dos cosas salen de la MISMA consulta: la que arma el listado. Si a esa
-- consulta le falta una columna, falla; la pantalla mostraba lista vacía —que
-- se lee igual que "no hay ninguna"— y el Excel devolvía 500 sin decir por qué.
-- Las compras están guardadas: lo que no funcionaba era leerlas.
--
-- Igual que la 23, esto NO va detrás del error puntual: agrega todas las
-- columnas que el módulo lee y escribe, y al final imprime el estado de cada
-- una para que no haya que volver a empezar.
--
-- Alcance: SOLO el schema `distribuidorajmerp`. No toca `public` ni ningún otro.
-- Idempotente: volver a correrlo no agrega nada ni cambia un solo dato.
-- ============================================================================

-- ── 1. Columnas de `compras` y `compra_items` ──────────────────────────────
DO $$
DECLARE
  v_schema    text := 'distribuidorajmerp';
  v_agregadas text[] := ARRAY[]::text[];
  v_col       record;
BEGIN
  FOR v_col IN
    SELECT * FROM (VALUES
      -- Identificación del comprobante.
      ('compras', 'numero_control',          'text'),
      ('compras', 'numero_comprobante',      'text'),
      ('compras', 'tipo_comprobante',        'text'),
      ('compras', 'nro_timbrado',            'text'),
      ('compras', 'estado',                  'text'),
      ('compras', 'fecha',                   'timestamptz'),
      -- Proveedor y producto (el listado los muestra sin JOIN, por snapshot).
      ('compras', 'proveedor_id',            'uuid'),
      ('compras', 'proveedor_nombre',        'text'),
      ('compras', 'producto_id',             'uuid'),
      ('compras', 'producto_nombre',         'text'),
      -- Importes.
      ('compras', 'cantidad',                'numeric'),
      ('compras', 'moneda',                  'text'),
      ('compras', 'tipo_cambio',             'numeric'),
      ('compras', 'costo_unitario_original', 'numeric'),
      ('compras', 'costo_unitario',          'numeric'),
      ('compras', 'iva_tipo',                'text'),
      ('compras', 'subtotal',                'numeric'),
      ('compras', 'monto_iva',               'numeric'),
      ('compras', 'total',                   'numeric'),
      ('compras', 'precio_venta',            'numeric'),
      ('compras', 'margen_venta',            'numeric'),
      -- Condiciones de pago.
      ('compras', 'tipo_pago',               'text'),
      ('compras', 'plazo_dias',              'integer'),
      ('compras', 'cuotas',                  'integer'),
      -- Contabilidad y trazabilidad.
      ('compras', 'cuenta_contable_id',      'uuid'),
      ('compras', 'cuenta_contrapartida_id', 'uuid'),
      ('compras', 'orden_compra_id',         'uuid'),
      ('compras', 'origen_compra',           'text'),
      ('compras', 'afecta_stock',            'boolean'),
      ('compras', 'idempotency_key',         'uuid'),
      ('compras', 'documento_path',          'text'),
      ('compras', 'documento_mime',          'text'),
      ('compras', 'created_by',              'uuid'),
      ('compras', 'usuario_nombre',          'text'),
      ('compras', 'created_at',              'timestamptz'),
      ('compras', 'updated_at',              'timestamptz'),
      -- Líneas de la compra.
      ('compra_items', 'compra_id',               'uuid'),
      ('compra_items', 'producto_id',             'uuid'),
      ('compra_items', 'producto_nombre',         'text'),
      ('compra_items', 'descripcion',             'text'),
      ('compra_items', 'cantidad',                'numeric'),
      ('compra_items', 'costo_unitario',          'numeric'),
      ('compra_items', 'iva_tipo',                'text'),
      ('compra_items', 'subtotal',                'numeric'),
      ('compra_items', 'monto_iva',               'numeric'),
      ('compra_items', 'total_linea',             'numeric'),
      ('compra_items', 'cuenta_contable_id',      'uuid'),
      ('compra_items', 'recepcion_item_id',       'uuid'),
      ('compra_items', 'afecta_inventario',       'boolean'),
      ('compra_items', 'costo_unitario_ordenado', 'numeric'),
      ('compra_items', 'costo_unitario_recibido', 'numeric'),
      ('compra_items', 'orden_linea',             'integer')
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

-- ── 2. `compra_items` si no existe ─────────────────────────────────────────
-- Una compra multilínea guarda la cabecera en `compras` y cada renglón acá.
DO $$
DECLARE
  v_schema text := 'distribuidorajmerp';
BEGIN
  IF to_regclass(v_schema || '.compra_items') IS NULL THEN
    EXECUTE format($f$
      CREATE TABLE %I.compra_items (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id   uuid NOT NULL,
        compra_id    uuid NOT NULL,
        producto_id  uuid,
        producto_nombre text,
        descripcion  text,
        cantidad     numeric NOT NULL DEFAULT 0,
        costo_unitario numeric NOT NULL DEFAULT 0,
        iva_tipo     text,
        subtotal     numeric NOT NULL DEFAULT 0,
        monto_iva    numeric NOT NULL DEFAULT 0,
        total_linea  numeric NOT NULL DEFAULT 0,
        cuenta_contable_id uuid,
        recepcion_item_id  uuid,
        afecta_inventario  boolean NOT NULL DEFAULT true,
        costo_unitario_ordenado numeric,
        costo_unitario_recibido numeric,
        orden_linea  integer,
        created_at   timestamptz NOT NULL DEFAULT now()
      )
    $f$, v_schema);
    EXECUTE format('CREATE INDEX idx_compra_items_compra ON %I.compra_items (empresa_id, compra_id)', v_schema);
    EXECUTE format('ALTER TABLE %I.compra_items ENABLE ROW LEVEL SECURITY', v_schema);
    RAISE NOTICE 'creada compra_items.';

    -- Permisos copiados de una tabla que el ERP ya usa.
    DECLARE v_modelo text; r record; BEGIN
      SELECT c.relname INTO v_modelo FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = v_schema AND c.relkind = 'r'
         AND c.relname IN ('ventas','clientes','productos','usuarios')
       ORDER BY array_position(ARRAY['ventas','clientes','productos','usuarios'], c.relname) LIMIT 1;
      IF v_modelo IS NOT NULL THEN
        FOR r IN SELECT DISTINCT grantee, privilege_type FROM information_schema.role_table_grants
                  WHERE table_schema = v_schema AND table_name = v_modelo AND grantee <> 'PUBLIC'
        LOOP
          EXECUTE format('GRANT %s ON TABLE %I.compra_items TO %I', r.privilege_type, v_schema, r.grantee);
        END LOOP;
      END IF;
    END;
  ELSE
    RAISE NOTICE 'compra_items ya existía.';
  END IF;
END;
$$;

-- El número de comprobante no se repite por proveedor: es lo que evita cargar
-- dos veces la misma factura. Solo se crea si no hay duplicados ya cargados.
DO $$
DECLARE
  v_schema text := 'distribuidorajmerp';
  v_dups   int;
BEGIN
  IF to_regclass(v_schema || '.compras') IS NULL THEN RETURN; END IF;
  -- Es un índice, no una constraint: se busca en pg_indexes. Buscarlo en
  -- pg_constraint no lo encontraba nunca y la segunda corrida reventaba con
  -- "relation compras_idempotency_unica already exists".
  IF EXISTS (SELECT 1 FROM pg_indexes
              WHERE schemaname = v_schema AND indexname = 'compras_idempotency_unica') THEN
    RAISE NOTICE 'índice de idempotencia: ya estaba.';
    RETURN;
  END IF;

  EXECUTE format(
    'SELECT count(*) FROM (SELECT idempotency_key FROM %I.compras
       WHERE idempotency_key IS NOT NULL GROUP BY idempotency_key HAVING count(*) > 1) d',
    v_schema) INTO v_dups;

  IF v_dups > 0 THEN
    RAISE NOTICE 'hay % claves de idempotencia repetidas: no se crea el índice único.', v_dups;
  ELSE
    EXECUTE format('CREATE UNIQUE INDEX compras_idempotency_unica ON %I.compras (empresa_id, idempotency_key) WHERE idempotency_key IS NOT NULL', v_schema);
    RAISE NOTICE 'índice de idempotencia creado.';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ── Verificación: TODO lo que Compras lee ──────────────────────────────────
-- Cualquier fila que no diga "ok" es una consulta que va a seguir fallando.
WITH requerido(tabla, campo) AS (
  VALUES
    ('compras','numero_control'), ('compras','numero_comprobante'), ('compras','tipo_comprobante'),
    ('compras','nro_timbrado'), ('compras','estado'), ('compras','fecha'),
    ('compras','proveedor_id'), ('compras','proveedor_nombre'),
    ('compras','producto_id'), ('compras','producto_nombre'),
    ('compras','cantidad'), ('compras','moneda'), ('compras','tipo_cambio'),
    ('compras','costo_unitario_original'), ('compras','costo_unitario'),
    ('compras','iva_tipo'), ('compras','subtotal'), ('compras','monto_iva'),
    ('compras','total'), ('compras','precio_venta'), ('compras','margen_venta'),
    ('compras','tipo_pago'), ('compras','plazo_dias'), ('compras','cuotas'),
    ('compras','cuenta_contable_id'), ('compras','cuenta_contrapartida_id'),
    ('compras','orden_compra_id'), ('compras','origen_compra'), ('compras','afecta_stock'),
    ('compras','idempotency_key'), ('compras','documento_path'), ('compras','documento_mime'),
    ('compras','created_by'), ('compras','usuario_nombre'),
    ('compras','created_at'), ('compras','updated_at'), ('compras','estado_contable'),
    ('compra_items','compra_id'), ('compra_items','producto_nombre'),
    ('compra_items','cantidad'), ('compra_items','costo_unitario'),
    ('compra_items','total_linea'), ('compra_items','cuenta_contable_id'),
    ('plan_cuentas','cuenta'), ('plan_cuentas','denominacion')
)
SELECT r.tabla, r.campo,
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

-- Cuántas compras hay realmente guardadas, más allá de lo que muestre la pantalla.
SELECT count(*) AS compras_guardadas FROM distribuidorajmerp.compras;
