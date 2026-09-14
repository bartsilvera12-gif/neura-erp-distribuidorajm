-- =============================================================================
-- Módulo Repartos — camiones, aperturas, stock cargado y devoluciones
--
-- Aditiva e idempotente: sólo crea lo que falta. No toca tablas existentes salvo
-- para agregar dos columnas nullables (`ventas.reparto_id` y
-- `usuarios.es_repartidor`), ambas retrocompatibles.
--
-- Modelo (ver DEPLOY_DISTRIBUIDORAJM.md · mockups de app móvil de reparto):
--   · Un `reparto` = (camión, repartidor, fecha). Estados abierto → cerrado.
--   · Al abrir se cargan filas en `reparto_stock` con la cantidad inicial que
--     lleva el camión por producto (kg o unidades, según `unidad_medida`).
--   · Cada venta del día apunta al reparto vía `ventas.reparto_id` y descuenta
--     de `reparto_stock` (ese descuento lo hace la API, no un trigger, para no
--     mezclarse con el descuento de inventario general).
--   · Al cierre se anota lo que vuelve al depósito en `reparto_devoluciones` y
--     la diferencia (inicial - vendido - devuelto) queda como `merma_kg` en la
--     tabla `repartos`.
--
-- Este repo es un fork dedicado a Distribuidora JM. Aunque la instancia Postgres
-- es compartida (mismo Supabase que instemaq, alquiloya, etc.), el módulo de
-- reparto es propio de este cliente: por eso la migración **sólo toca
-- `distribuidorajmerp`**. Los otros tenants no ven ni las tablas nuevas ni la
-- columna `usuarios.es_repartidor` ni `ventas.reparto_id`.
--
-- Si el módulo después se generaliza al ERP base, ese repo tendrá su propia
-- migración multi-schema; acá no queremos alterar tablas ajenas.
--
-- El seed puntual del primer camión va aparte (`supabase/distribuidorajm/
-- 05_camion_seed.sql`) porque necesita el empresa_id concreto.
--
-- Seguridad:
--   · RLS activo y SIN políticas, y sin permisos para `anon` ni `authenticated`.
--     Toda lectura y escritura pasa por la API con service role, igual que
--     `soporte_*` y `chat_interno_*`. Un repartidor con token propio no puede
--     ver el reparto de otro camión consultando PostgREST directo.
-- =============================================================================

DO $$
DECLARE
  sch constant text := 'distribuidorajmerp';
BEGIN
  -- Si otra transacción (PostgREST, un job) está leyendo alguna tabla que hay
  -- que alterar, en vez de deadlockear preferimos fallar rápido: se reintenta
  -- el script y listo. Sin esto, el ALTER TABLE se queda esperando el
  -- AccessExclusiveLock y el planner elige a alguien como víctima del deadlock.
  PERFORM set_config('lock_timeout', '5s', true);
  -- Si en esta instancia todavía no existe el schema (por ejemplo, la
  -- migración se corre antes que 01_clonar_schema.sql en un entorno nuevo), no
  -- rompemos: salimos limpios. Al rehacerse tras el clon, entra acá.
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = sch) THEN
    RAISE NOTICE 'Schema % no existe todavía, se omite la migración de repartos.', sch;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = sch AND c.relname IN ('empresas','productos','ventas','usuarios') AND c.relkind = 'r'
    GROUP BY n.nspname
    HAVING COUNT(*) = 4
  ) THEN
    RAISE EXCEPTION 'Schema % no tiene todas las tablas base (empresas/productos/ventas/usuarios). ¿Corriste 01_clonar_schema.sql?', sch;
  END IF;

  -- Bandera `es_repartidor` en usuarios (mismo patrón que `es_tecnico`,
    -- `es_qa`, `es_project_manager`).
    EXECUTE format(
    'ALTER TABLE %I.usuarios ADD COLUMN IF NOT EXISTS es_repartidor boolean NOT NULL DEFAULT false',
    sch
  );

    -- ------------------------------------------------------------------ camiones
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.camiones (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        alias      text NOT NULL,
        patente    text,
        activo     boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    $f$, sch, sch);

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_camiones_empresa ON %I.camiones(empresa_id)',
      sch
    );
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_camiones_empresa_alias ON %I.camiones(empresa_id, lower(alias))',
      sch
    );

    EXECUTE format('ALTER TABLE %I.camiones ENABLE ROW LEVEL SECURITY', sch);

    -- ------------------------------------------------------------------ repartos
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.repartos (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id     uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        camion_id      uuid NOT NULL REFERENCES %I.camiones(id) ON DELETE RESTRICT,
        repartidor_id  uuid NOT NULL REFERENCES %I.usuarios(id) ON DELETE RESTRICT,
        fecha          date NOT NULL,
        estado         text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'cerrado')),
        abierto_at     timestamptz NOT NULL DEFAULT now(),
        cerrado_at     timestamptz,
        merma_kg       numeric,
        notas_cierre   text,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now()
      )
    $f$, sch, sch, sch, sch);

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_repartos_empresa ON %I.repartos(empresa_id)',
      sch
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_repartos_fecha ON %I.repartos(fecha DESC)',
      sch
    );
    -- Un solo reparto ABIERTO por camión a la vez (un camión no puede estar
    -- entregando dos rutas simultáneamente).
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_repartos_camion_abierto
         ON %I.repartos(empresa_id, camion_id)
         WHERE estado = ''abierto''',
      sch
    );

    EXECUTE format('ALTER TABLE %I.repartos ENABLE ROW LEVEL SECURITY', sch);

    -- ------------------------------------------------------------ reparto_stock
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.reparto_stock (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id         uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        reparto_id         uuid NOT NULL REFERENCES %I.repartos(id) ON DELETE CASCADE,
        producto_id        uuid NOT NULL REFERENCES %I.productos(id) ON DELETE RESTRICT,
        unidad_medida      text NOT NULL,
        cantidad_inicial   numeric NOT NULL CHECK (cantidad_inicial >= 0),
        cantidad_vendida   numeric NOT NULL DEFAULT 0 CHECK (cantidad_vendida >= 0),
        cantidad_devuelta  numeric NOT NULL DEFAULT 0 CHECK (cantidad_devuelta >= 0),
        created_at         timestamptz NOT NULL DEFAULT now(),
        updated_at         timestamptz NOT NULL DEFAULT now(),
        UNIQUE (reparto_id, producto_id)
      )
    $f$, sch, sch, sch, sch);

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_reparto_stock_empresa ON %I.reparto_stock(empresa_id)',
      sch
    );

    EXECUTE format('ALTER TABLE %I.reparto_stock ENABLE ROW LEVEL SECURITY', sch);

    -- ------------------------------------------------------- reparto_devoluciones
    -- Los renglones acá se llenan al cerrar el reparto: qué mercadería vuelve al
    -- depósito. `cantidad_vendida` se recalcula desde `ventas_items` cuando la API
    -- cierra el reparto, no hace falta duplicarlo acá.
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.reparto_devoluciones (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id     uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        reparto_id     uuid NOT NULL REFERENCES %I.repartos(id) ON DELETE CASCADE,
        producto_id    uuid NOT NULL REFERENCES %I.productos(id) ON DELETE RESTRICT,
        unidad_medida  text NOT NULL,
        cantidad       numeric NOT NULL CHECK (cantidad >= 0),
        created_at     timestamptz NOT NULL DEFAULT now(),
        UNIQUE (reparto_id, producto_id)
      )
    $f$, sch, sch, sch, sch);

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_reparto_devoluciones_empresa ON %I.reparto_devoluciones(empresa_id)',
      sch
    );

    EXECUTE format('ALTER TABLE %I.reparto_devoluciones ENABLE ROW LEVEL SECURITY', sch);

    -- ------------------------------------------------- ventas.reparto_id (link)
    -- Nullable: la venta mostrador clásica (sin reparto) sigue funcionando igual.
    -- ON DELETE SET NULL: si borran un reparto viejo, la venta histórica queda.
    EXECUTE format(
      'ALTER TABLE %I.ventas ADD COLUMN IF NOT EXISTS reparto_id uuid REFERENCES %I.repartos(id) ON DELETE SET NULL',
      sch, sch
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_ventas_reparto ON %I.ventas(reparto_id) WHERE reparto_id IS NOT NULL',
      sch
    );

END $$;

NOTIFY pgrst, 'reload schema';
