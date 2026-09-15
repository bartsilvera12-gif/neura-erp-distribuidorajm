-- =============================================================================
-- 06 · REPARTOS: carga del camión, devoluciones y control de mercadería
-- =============================================================================
-- Necesaria para el control de mercadería del cierre de reparto. Sin estas
-- tablas, el cierre sigue funcionando pero sin esa sección.
--
-- Modelo, por producto y por reparto:
--
--   esperado   = cargado − vendido + devuelto
--   diferencia = retornado − esperado        (0 = cuadra)
--
-- `devuelto` es lo que el cliente rechaza y vuelve en el camión, por eso SUMA
-- a lo que debería volver. `retornado` es lo que realmente se cuenta al cerrar.
--
-- Solo toca distribuidorajmerp. Idempotente: se puede correr de nuevo.
-- =============================================================================

-- ── Reparto: una salida de un camión en un día ──────────────────────────────
CREATE TABLE IF NOT EXISTS distribuidorajmerp.repartos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL,
  fecha          date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Asuncion')::date,
  camion         text NOT NULL,
  responsable    text,
  estado         text NOT NULL DEFAULT 'abierto',
  observaciones  text,
  abierto_at     timestamptz NOT NULL DEFAULT now(),
  cerrado_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'distribuidorajmerp.repartos'::regclass
                   AND conname = 'repartos_estado_check') THEN
    ALTER TABLE distribuidorajmerp.repartos
      ADD CONSTRAINT repartos_estado_check CHECK (estado IN ('abierto', 'cerrado'));
  END IF;

  -- Un reparto cerrado tiene que tener fecha de cierre, y uno abierto no.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'distribuidorajmerp.repartos'::regclass
                   AND conname = 'repartos_cerrado_at_check') THEN
    ALTER TABLE distribuidorajmerp.repartos
      ADD CONSTRAINT repartos_cerrado_at_check
      CHECK ((estado = 'cerrado') = (cerrado_at IS NOT NULL));
  END IF;
END;
$$;

-- Un camión no puede estar en dos repartos abiertos a la vez: si pasara, las
-- ventas no sabrían a cuál pertenecen.
CREATE UNIQUE INDEX IF NOT EXISTS idx_repartos_camion_abierto
  ON distribuidorajmerp.repartos (empresa_id, lower(btrim(camion)))
  WHERE estado = 'abierto';

CREATE INDEX IF NOT EXISTS idx_repartos_empresa_fecha
  ON distribuidorajmerp.repartos (empresa_id, fecha DESC);

-- ── Carga, devoluciones y retorno, por producto ─────────────────────────────
CREATE TABLE IF NOT EXISTS distribuidorajmerp.reparto_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL,
  reparto_id  uuid NOT NULL REFERENCES distribuidorajmerp.repartos(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES distribuidorajmerp.productos(id) ON DELETE RESTRICT,
  cargado     numeric NOT NULL DEFAULT 0,
  devuelto    numeric NOT NULL DEFAULT 0,
  /** NULL hasta que se cuenta al cerrar: 0 contado y "sin contar" no son lo mismo. */
  retornado   numeric,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'distribuidorajmerp.reparto_items'::regclass
                   AND conname = 'reparto_items_cantidades_check') THEN
    ALTER TABLE distribuidorajmerp.reparto_items
      ADD CONSTRAINT reparto_items_cantidades_check
      CHECK (cargado >= 0 AND devuelto >= 0 AND (retornado IS NULL OR retornado >= 0));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'distribuidorajmerp.reparto_items'::regclass
                   AND conname = 'reparto_items_reparto_producto_key') THEN
    ALTER TABLE distribuidorajmerp.reparto_items
      ADD CONSTRAINT reparto_items_reparto_producto_key UNIQUE (reparto_id, producto_id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_reparto_items_reparto
  ON distribuidorajmerp.reparto_items (reparto_id);

-- ── La venta sabe de qué reparto salió ──────────────────────────────────────
-- Sin esto, "vendido" sería todas las ventas del día y con dos camiones el
-- control de mercadería daría cualquier cosa.
ALTER TABLE distribuidorajmerp.ventas
  ADD COLUMN IF NOT EXISTS reparto_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'distribuidorajmerp.ventas'::regclass
                   AND conname = 'ventas_reparto_id_fkey') THEN
    ALTER TABLE distribuidorajmerp.ventas
      ADD CONSTRAINT ventas_reparto_id_fkey
      FOREIGN KEY (reparto_id) REFERENCES distribuidorajmerp.repartos(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_ventas_reparto
  ON distribuidorajmerp.ventas (reparto_id) WHERE reparto_id IS NOT NULL;

-- ── RLS, igual que el resto del schema ──────────────────────────────────────
ALTER TABLE distribuidorajmerp.repartos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE distribuidorajmerp.reparto_items  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  -- Se usa la misma función de acceso que las demás tablas del schema. Si no
  -- existe (schema armado de otra forma), se deja RLS activo sin policy: el
  -- service_role sigue entrando y nadie más.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'distribuidorajmerp' AND p.proname = 'puede_acceder_empresa'
  ) THEN
    FOREACH t IN ARRAY ARRAY['repartos', 'reparto_items']
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON distribuidorajmerp.%I', t || '_acceso', t);
      EXECUTE format(
        'CREATE POLICY %I ON distribuidorajmerp.%I FOR ALL
           USING (distribuidorajmerp.puede_acceder_empresa(empresa_id))
           WITH CHECK (distribuidorajmerp.puede_acceder_empresa(empresa_id))',
        t || '_acceso', t
      );
    END LOOP;
  ELSE
    RAISE NOTICE 'repartos: no se encontró puede_acceder_empresa; RLS queda sin policy.';
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON distribuidorajmerp.repartos, distribuidorajmerp.reparto_items TO authenticated;
GRANT ALL
  ON distribuidorajmerp.repartos, distribuidorajmerp.reparto_items TO postgres, service_role;

COMMENT ON TABLE distribuidorajmerp.repartos IS
  'Salida de un camión en un día. Las ventas de la Caja se estampan con su id.';
COMMENT ON COLUMN distribuidorajmerp.reparto_items.devuelto IS
  'Rechazado por el cliente: vuelve en el camión, así que suma a lo esperado.';
COMMENT ON COLUMN distribuidorajmerp.reparto_items.retornado IS
  'Contado al cerrar. NULL = todavía no se contó.';

SELECT pg_notify('pgrst', 'reload schema');
