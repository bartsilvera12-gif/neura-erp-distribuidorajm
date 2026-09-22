-- ============================================================================
-- 34. Órdenes de compra y recepciones — el circuito completo
-- ============================================================================
--
-- Las dos pantallas fallaban al abrirse porque el listado cruza tres tablas que
-- este schema no tiene. `ordenes_compra` sí existe, pero le faltan las columnas
-- de aprobación, cancelación y cierre.
--
-- El circuito que queda habilitado:
--   1. Orden de compra al proveedor  (documento de intención: no mueve stock)
--   2. Recepción de la mercadería    (entra al inventario de una ubicación)
--   3. Compra contra la factura      (lo que ya funcionaba)
--
-- Las columnas no son a ojo: salen de leer cada INSERT, UPDATE y SELECT del
-- código que las toca.
--
-- Alcance: SOLO el schema `distribuidorajmerp`. No toca `public` ni ningún otro.
-- Idempotente: volver a correrlo no crea nada de nuevo ni cambia un solo dato.
-- ============================================================================

DO $$
DECLARE
  v_schema text := 'distribuidorajmerp';
  v_hechas text[] := ARRAY[]::text[];
  v_col    record;
BEGIN
  -- ── 1. Renglones de la orden ─────────────────────────────────────────────
  IF to_regclass(v_schema || '.orden_compra_items') IS NULL THEN
    EXECUTE format($f$
      CREATE TABLE %I.orden_compra_items (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id uuid NOT NULL,
        orden_id   uuid NOT NULL,
        producto_id      uuid,
        producto_nombre  text,
        descripcion      text,
        cantidad         numeric NOT NULL DEFAULT 0,
        costo_unitario_estimado numeric NOT NULL DEFAULT 0,
        iva_tipo         text,
        cuenta_contable_id uuid,
        -- Para que los renglones se muestren en el orden en que se cargaron.
        orden_linea      integer NOT NULL DEFAULT 0,
        created_at       timestamptz NOT NULL DEFAULT now()
      )
    $f$, v_schema);
    EXECUTE format('CREATE INDEX idx_oci_orden ON %I.orden_compra_items (empresa_id, orden_id, orden_linea)', v_schema);
    v_hechas := v_hechas || 'orden_compra_items'::text;
  END IF;

  -- ── 2. Recepciones ───────────────────────────────────────────────────────
  IF to_regclass(v_schema || '.recepciones') IS NULL THEN
    EXECUTE format($f$
      CREATE TABLE %I.recepciones (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id uuid NOT NULL,
        numero     text,
        orden_id   uuid,
        proveedor_id     uuid,
        proveedor_nombre text,
        fecha      date,
        -- A qué depósito o camión entró la mercadería.
        ubicacion_id uuid,
        observacion  text,
        documento_url text,
        estado       text NOT NULL DEFAULT 'recibida',
        -- Cuánto de lo recibido ya vino con factura del proveedor.
        estado_facturacion text NOT NULL DEFAULT 'pendiente',
        -- Se recibió más de lo pedido y alguien lo autorizó.
        excedente_confirmado boolean NOT NULL DEFAULT false,
        motivo_excedente     text,
        idempotency_key uuid,
        created_by   uuid,
        usuario_nombre text,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now()
      )
    $f$, v_schema);
    EXECUTE format('CREATE UNIQUE INDEX recepciones_idem ON %I.recepciones (empresa_id, idempotency_key) WHERE idempotency_key IS NOT NULL', v_schema);
    EXECUTE format('CREATE INDEX idx_recepciones_fecha ON %I.recepciones (empresa_id, fecha DESC)', v_schema);
    EXECUTE format('CREATE INDEX idx_recepciones_orden ON %I.recepciones (empresa_id, orden_id)', v_schema);
    v_hechas := v_hechas || 'recepciones'::text;
  END IF;

  -- ── 3. Renglones de la recepción ─────────────────────────────────────────
  IF to_regclass(v_schema || '.recepcion_items') IS NULL THEN
    EXECUTE format($f$
      CREATE TABLE %I.recepcion_items (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id   uuid NOT NULL,
        recepcion_id uuid NOT NULL,
        -- Qué renglón de la orden cubre. Null si se recibió sin orden.
        orden_item_id uuid,
        producto_id      uuid,
        producto_nombre  text,
        cantidad_recibida        numeric NOT NULL DEFAULT 0,
        costo_unitario_recibido  numeric NOT NULL DEFAULT 0,
        cantidad_facturada       numeric NOT NULL DEFAULT 0,
        -- El movimiento de inventario que generó esta línea.
        movimiento_id uuid,
        created_at    timestamptz NOT NULL DEFAULT now()
      )
    $f$, v_schema);
    EXECUTE format('CREATE INDEX idx_ri_recepcion ON %I.recepcion_items (empresa_id, recepcion_id)', v_schema);
    EXECUTE format('CREATE INDEX idx_ri_orden_item ON %I.recepcion_items (empresa_id, orden_item_id)', v_schema);
    v_hechas := v_hechas || 'recepcion_items'::text;
  END IF;

  -- ── 4. Lo que le falta a `ordenes_compra` ────────────────────────────────
  IF to_regclass(v_schema || '.ordenes_compra') IS NOT NULL THEN
    FOR v_col IN
      SELECT * FROM (VALUES
        ('numero',           'text'),
        ('proveedor_id',     'uuid'),
        ('proveedor_nombre', 'text'),
        ('fecha',            'date'),
        ('fecha_estimada',   'date'),
        ('observaciones',    'text'),
        ('moneda',           'text'),
        ('tipo_cambio',      'numeric'),
        ('total_estimado',   'numeric'),
        ('estado',           'text'),
        ('idempotency_key',  'uuid'),
        ('created_by',       'uuid'),
        ('usuario_nombre',   'text'),
        ('aprobada_by',      'uuid'),
        ('aprobada_at',      'timestamptz'),
        ('cancelada_by',     'uuid'),
        ('cancelada_at',     'timestamptz'),
        ('motivo_cancelacion', 'text'),
        ('cerrada_by',       'uuid'),
        ('cerrada_at',       'timestamptz'),
        ('motivo_cierre',    'text'),
        ('cierre_automatico', 'boolean'),
        ('updated_at',       'timestamptz')
      ) AS t(campo, tipo)
    LOOP
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = v_schema AND table_name = 'ordenes_compra'
           AND column_name = v_col.campo
      );
      EXECUTE format('ALTER TABLE %I.ordenes_compra ADD COLUMN %I %s', v_schema, v_col.campo, v_col.tipo);
      v_hechas := v_hechas || ('ordenes_compra.' || v_col.campo)::text;
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes
                    WHERE schemaname = v_schema AND tablename = 'ordenes_compra'
                      AND indexname = 'ordenes_compra_idem') THEN
      EXECUTE format('CREATE UNIQUE INDEX ordenes_compra_idem ON %I.ordenes_compra (empresa_id, idempotency_key) WHERE idempotency_key IS NOT NULL', v_schema);
      v_hechas := v_hechas || 'ordenes_compra_idem'::text;
    END IF;
  END IF;

  -- ── 5. Los permisos que PostgREST necesita ───────────────────────────────
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated', v_schema);
  EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA %I TO postgres, service_role', v_schema);

  IF array_length(v_hechas, 1) IS NULL THEN
    RAISE NOTICE 'no faltaba nada.';
  ELSE
    RAISE NOTICE 'creado: %', array_to_string(v_hechas, ', ');
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ── Verificación: los tres pasos del circuito ──────────────────────────────
WITH requerido(paso, tabla, campo) AS (
  VALUES
    (1, 'ordenes_compra', 'numero'), (1, 'ordenes_compra', 'proveedor_nombre'),
    (1, 'ordenes_compra', 'fecha_estimada'), (1, 'ordenes_compra', 'total_estimado'),
    (1, 'ordenes_compra', 'estado'), (1, 'ordenes_compra', 'idempotency_key'),
    (1, 'ordenes_compra', 'aprobada_by'), (1, 'ordenes_compra', 'aprobada_at'),
    (1, 'ordenes_compra', 'cancelada_by'), (1, 'ordenes_compra', 'motivo_cancelacion'),
    (1, 'ordenes_compra', 'cerrada_by'), (1, 'ordenes_compra', 'motivo_cierre'),
    (1, 'ordenes_compra', 'cierre_automatico'), (1, 'ordenes_compra', 'usuario_nombre'),
    (1, 'orden_compra_items', 'orden_id'), (1, 'orden_compra_items', 'producto_nombre'),
    (1, 'orden_compra_items', 'cantidad'), (1, 'orden_compra_items', 'costo_unitario_estimado'),
    (1, 'orden_compra_items', 'iva_tipo'), (1, 'orden_compra_items', 'cuenta_contable_id'),
    (1, 'orden_compra_items', 'orden_linea'),
    (2, 'recepciones', 'numero'), (2, 'recepciones', 'orden_id'),
    (2, 'recepciones', 'ubicacion_id'), (2, 'recepciones', 'documento_url'),
    (2, 'recepciones', 'estado'), (2, 'recepciones', 'estado_facturacion'),
    (2, 'recepciones', 'excedente_confirmado'), (2, 'recepciones', 'motivo_excedente'),
    (2, 'recepciones', 'idempotency_key'), (2, 'recepciones', 'usuario_nombre'),
    (2, 'recepcion_items', 'recepcion_id'), (2, 'recepcion_items', 'orden_item_id'),
    (2, 'recepcion_items', 'cantidad_recibida'), (2, 'recepcion_items', 'costo_unitario_recibido'),
    (2, 'recepcion_items', 'cantidad_facturada'), (2, 'recepcion_items', 'movimiento_id'),
    (3, 'movimientos_inventario', 'documento_tipo'),
    (3, 'inventario_stock_ubicacion', 'stock_actual'),
    (3, 'productos', 'costo_promedio')
)
SELECT r.paso,
       CASE r.paso
         WHEN 1 THEN '1. orden de compra'
         WHEN 2 THEN '2. recepcion'
         ELSE '3. entrada al inventario'
       END AS etapa,
       r.tabla, r.campo,
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
          r.paso, r.tabla, r.campo;
