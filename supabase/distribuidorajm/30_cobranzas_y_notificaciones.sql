-- ============================================================================
-- 30. Cobranzas y la campanita — las tablas que faltaban
-- ============================================================================
--
-- Del inventario de la migración 29 salieron 36 objetos faltantes. La mayoría
-- son de módulos de la agencia que JM no tiene habilitados (proyectos, QA,
-- omnicanal, centro de ayuda) y se dejan afuera a propósito: crear tablas que
-- nadie va a usar solo ensucia el schema.
--
-- Estas tres SÍ rompen módulos habilitados:
--   · cobros_pendientes      Cobranzas → transferencias por aprobar
--   · cobranza_promesas      Cobranzas → promesas de pago
--   · usuario_notificaciones la campanita, que está en TODAS las pantallas
--
-- Las columnas no son a ojo: salen de leer cada consulta del código que las
-- toca (alta, aprobación, rechazo, anulación, comprobante, listado y conteo).
--
-- Alcance: SOLO el schema `distribuidorajmerp`. No toca `public` ni ningún otro.
-- Idempotente: volver a correrlo no crea nada de nuevo ni cambia un solo dato.
-- ============================================================================

DO $$
DECLARE
  v_schema text := 'distribuidorajmerp';
  v_hechas text[] := ARRAY[]::text[];
BEGIN
  -- ── 1. Transferencias pendientes de aprobación ───────────────────────────
  IF to_regclass(v_schema || '.cobros_pendientes') IS NULL THEN
    EXECUTE format($f$
      CREATE TABLE %I.cobros_pendientes (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id    uuid NOT NULL,
        factura_id    uuid,
        cliente_id    uuid,
        monto         numeric NOT NULL DEFAULT 0,
        fecha         date,
        -- Banco y número de operación, en crudo y normalizados. Los `_norm`
        -- son los que impiden cargar dos veces la misma transferencia
        -- escribiendo el banco distinto.
        banco_origen           text,
        banco_origen_norm      text,
        titular                text,
        numero_operacion       text,
        numero_operacion_norm  text,
        -- pendiente | aprobado | rechazado | anulado
        estado        text NOT NULL DEFAULT 'pendiente',
        -- Comprobante que sube el cobrador.
        comprobante_path text,
        comprobante_mime text,
        -- Reintento tras un corte de red: la misma clave devuelve la fila que
        -- ya se guardó en vez de duplicar el cobro.
        idempotency_key uuid,
        pago_id             uuid,
        aprobado_by         uuid,
        aprobado_at         timestamptz,
        motivo_rechazo      text,
        rechazado_by        uuid,
        rechazado_at        timestamptz,
        motivo_anulacion    text,
        anulado_by          uuid,
        anulado_at          timestamptz,
        asiento_reversion_id uuid,
        created_by    uuid,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    $f$, v_schema);
    -- El nombre tiene que contener "idem": el código lo busca así para
    -- distinguir el reintento del duplicado de verdad.
    EXECUTE format('CREATE UNIQUE INDEX cobros_pendientes_idem ON %I.cobros_pendientes (empresa_id, idempotency_key) WHERE idempotency_key IS NOT NULL', v_schema);
    EXECUTE format('CREATE UNIQUE INDEX cobros_pendientes_operacion_unica ON %I.cobros_pendientes (empresa_id, banco_origen_norm, numero_operacion_norm) WHERE numero_operacion_norm IS NOT NULL AND numero_operacion_norm <> ''''', v_schema);
    EXECUTE format('CREATE INDEX idx_cobros_pend_estado ON %I.cobros_pendientes (empresa_id, estado, created_at DESC)', v_schema);
    EXECUTE format('CREATE INDEX idx_cobros_pend_factura ON %I.cobros_pendientes (empresa_id, factura_id)', v_schema);
    v_hechas := v_hechas || 'cobros_pendientes'::text;
  END IF;

  -- ── 2. Promesas de pago ──────────────────────────────────────────────────
  IF to_regclass(v_schema || '.cobranza_promesas') IS NULL THEN
    EXECUTE format($f$
      CREATE TABLE %I.cobranza_promesas (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id       uuid NOT NULL,
        cliente_id       uuid NOT NULL,
        fecha_promesa    date NOT NULL,
        estado           text NOT NULL DEFAULT 'pendiente',
        creado_por       uuid,
        creado_por_email text,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now()
      )
    $f$, v_schema);
    EXECUTE format('CREATE INDEX idx_promesas_cliente ON %I.cobranza_promesas (empresa_id, cliente_id, estado)', v_schema);
    v_hechas := v_hechas || 'cobranza_promesas'::text;
  END IF;

  -- ── 3. La campanita ──────────────────────────────────────────────────────
  IF to_regclass(v_schema || '.usuario_notificaciones') IS NULL THEN
    EXECUTE format($f$
      CREATE TABLE %I.usuario_notificaciones (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id     uuid NOT NULL,
        usuario_id     uuid NOT NULL,
        -- A propósito SIN CHECK sobre `tipo`: en el schema de la agencia ese
        -- CHECK hacía que cada aviso nuevo fallara hasta correr otra migración.
        tipo           text NOT NULL,
        titulo         text,
        cuerpo         text,
        actor_id       uuid,
        proyecto_id    uuid,
        observacion_id uuid,
        agrupadas      integer NOT NULL DEFAULT 1,
        metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
        leida_at       timestamptz,
        created_at     timestamptz NOT NULL DEFAULT now()
      )
    $f$, v_schema);
    -- El panel pide las del usuario ordenadas por fecha, y el contador las no
    -- leídas: un índice parcial para cada cosa.
    EXECUTE format('CREATE INDEX idx_notif_usuario ON %I.usuario_notificaciones (empresa_id, usuario_id, created_at DESC)', v_schema);
    EXECUTE format('CREATE INDEX idx_notif_no_leidas ON %I.usuario_notificaciones (empresa_id, usuario_id) WHERE leida_at IS NULL', v_schema);
    v_hechas := v_hechas || 'usuario_notificaciones'::text;
  END IF;

  -- ── 4. Columnas que el cobro usa en `pagos` ──────────────────────────────
  IF to_regclass(v_schema || '.pagos') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = v_schema AND table_name = 'pagos'
                      AND column_name = 'cobro_pendiente_id') THEN
      EXECUTE format('ALTER TABLE %I.pagos ADD COLUMN cobro_pendiente_id uuid', v_schema);
      v_hechas := v_hechas || 'pagos.cobro_pendiente_id'::text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = v_schema AND table_name = 'pagos'
                      AND column_name = 'es_anticipo') THEN
      EXECUTE format('ALTER TABLE %I.pagos ADD COLUMN es_anticipo boolean NOT NULL DEFAULT false', v_schema);
      v_hechas := v_hechas || 'pagos.es_anticipo'::text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = v_schema AND table_name = 'pagos'
                      AND column_name = 'asiento_contable_id') THEN
      EXECUTE format('ALTER TABLE %I.pagos ADD COLUMN asiento_contable_id uuid', v_schema);
      v_hechas := v_hechas || 'pagos.asiento_contable_id'::text;
    END IF;
  END IF;

  -- ── 5. Los permisos que PostgREST necesita ───────────────────────────────
  -- Sin esto las tablas existen pero la pantalla sigue diciendo que no las
  -- encuentra, que es exactamente lo que pasó con `bancos`.
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

-- ── Verificación ───────────────────────────────────────────────────────────
WITH requerido(modulo, tabla, campo) AS (
  VALUES
    ('Cobranzas', 'cobros_pendientes', 'banco_origen_norm'),
    ('Cobranzas', 'cobros_pendientes', 'numero_operacion_norm'),
    ('Cobranzas', 'cobros_pendientes', 'idempotency_key'),
    ('Cobranzas', 'cobros_pendientes', 'comprobante_path'),
    ('Cobranzas', 'cobros_pendientes', 'comprobante_mime'),
    ('Cobranzas', 'cobros_pendientes', 'estado'),
    ('Cobranzas', 'cobros_pendientes', 'pago_id'),
    ('Cobranzas', 'cobros_pendientes', 'aprobado_by'),
    ('Cobranzas', 'cobros_pendientes', 'motivo_rechazo'),
    ('Cobranzas', 'cobros_pendientes', 'motivo_anulacion'),
    ('Cobranzas', 'cobros_pendientes', 'asiento_reversion_id'),
    ('Cobranzas', 'cobranza_promesas', 'fecha_promesa'),
    ('Cobranzas', 'cobranza_promesas', 'creado_por_email'),
    ('Cobranzas', 'pagos', 'cobro_pendiente_id'),
    ('Cobranzas', 'pagos', 'es_anticipo'),
    ('Cobranzas', 'pagos', 'asiento_contable_id'),
    ('Campanita', 'usuario_notificaciones', 'usuario_id'),
    ('Campanita', 'usuario_notificaciones', 'tipo'),
    ('Campanita', 'usuario_notificaciones', 'titulo'),
    ('Campanita', 'usuario_notificaciones', 'cuerpo'),
    ('Campanita', 'usuario_notificaciones', 'actor_id'),
    ('Campanita', 'usuario_notificaciones', 'proyecto_id'),
    ('Campanita', 'usuario_notificaciones', 'observacion_id'),
    ('Campanita', 'usuario_notificaciones', 'agrupadas'),
    ('Campanita', 'usuario_notificaciones', 'metadata'),
    ('Campanita', 'usuario_notificaciones', 'leida_at')
)
SELECT r.modulo, r.tabla, r.campo,
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
          r.modulo, r.tabla, r.campo;
