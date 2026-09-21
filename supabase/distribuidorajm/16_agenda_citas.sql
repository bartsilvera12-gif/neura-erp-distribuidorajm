-- ============================================================================
-- 16. Agenda: `agenda_citas` y `agenda_cita_responsables`
-- ============================================================================
--
-- El diagnóstico del 14 confirmó que las dos tablas no existen: el 01 clonó la
-- estructura del schema de origen, y ese origen no tenía el módulo Agenda. Por
-- eso la pantalla decía "Could not find the table 'distribuidorajmerp.
-- agenda_citas' in the schema cache".
--
-- Las columnas no se inventan: son exactamente las que el código ya lee y
-- escribe (`src/lib/agenda/types.ts` y `src/app/api/agenda/route.ts`). Una
-- columna de más o con otro nombre haría fallar el alta de la cita.
--
-- Sirve para visitas a clientes sin agregarle nada: la cita ya se puede atar a
-- un `cliente_id`, guardar a quién se visita (`contacto_nombre`,
-- `contacto_telefono`), dónde (`ubicacion`) y de qué se trata (`tipo`). El
-- responsable es el usuario que va, que en una distribuidora es el repartidor.
--
-- Idempotente: se puede correr dos veces. Solo crea, no toca nada existente.
-- ============================================================================

DO $$
DECLARE
  v_schema text := 'distribuidorajmerp';
  v_creadas text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass(v_schema || '.usuarios') IS NULL THEN
    RAISE EXCEPTION 'no existe %.usuarios: la cita necesita un responsable', v_schema;
  END IF;

  -- ── agenda_citas ─────────────────────────────────────────────────────────
  IF to_regclass(v_schema || '.agenda_citas') IS NULL THEN
    EXECUTE format($f$
      CREATE TABLE %I.agenda_citas (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id          uuid NOT NULL,
        cliente_id          uuid,
        prospecto_id        uuid,
        responsable_id      uuid NOT NULL,
        contacto_nombre     text,
        contacto_telefono   text,
        titulo              text NOT NULL,
        tipo                text,
        estado              text NOT NULL DEFAULT 'pendiente',
        inicio_at           timestamptz NOT NULL,
        fin_at              timestamptz NOT NULL,
        ubicacion           text,
        observaciones       text,
        reprogramada_de_id  uuid,
        cancelada_motivo    text,
        metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by          uuid,
        updated_by          uuid,
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now(),
        -- Los seis estados que el código conoce. Uno que no esté en esta lista
        -- rompería la pantalla, que decide el color y las transiciones por él.
        CONSTRAINT agenda_citas_estado_check CHECK (
          estado IN ('pendiente','confirmada','completada','no_asistio','cancelada','reprogramada')
        ),
        -- Una cita que termina antes de empezar no es una cita.
        CONSTRAINT agenda_citas_rango_check CHECK (fin_at >= inicio_at)
      )
    $f$, v_schema);

    -- La reprogramación apunta a la cita original: se borra en cascada nada,
    -- pero si la original desaparece el vínculo queda en NULL y no cuelga.
    EXECUTE format(
      'ALTER TABLE %I.agenda_citas ADD CONSTRAINT agenda_citas_reprogramada_fk '
      || 'FOREIGN KEY (reprogramada_de_id) REFERENCES %I.agenda_citas(id) ON DELETE SET NULL',
      v_schema, v_schema);

    EXECUTE format(
      'ALTER TABLE %I.agenda_citas ADD CONSTRAINT agenda_citas_responsable_fk '
      || 'FOREIGN KEY (responsable_id) REFERENCES %I.usuarios(id)',
      v_schema, v_schema);

    IF to_regclass(v_schema || '.clientes') IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE %I.agenda_citas ADD CONSTRAINT agenda_citas_cliente_fk '
        || 'FOREIGN KEY (cliente_id) REFERENCES %I.clientes(id) ON DELETE SET NULL',
        v_schema, v_schema);
    END IF;

    -- `prospecto_id` queda sin FK si el CRM no está: la columna existe igual
    -- porque el alta la manda, y una FK a una tabla ausente no se puede crear.
    IF to_regclass(v_schema || '.crm_prospectos') IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE %I.agenda_citas ADD CONSTRAINT agenda_citas_prospecto_fk '
        || 'FOREIGN KEY (prospecto_id) REFERENCES %I.crm_prospectos(id) ON DELETE SET NULL',
        v_schema, v_schema);
    END IF;

    -- El calendario siempre pide un rango de fechas de una empresa; el resto
    -- son los filtros de la pantalla.
    EXECUTE format('CREATE INDEX idx_agenda_citas_empresa_inicio ON %I.agenda_citas (empresa_id, inicio_at)', v_schema);
    EXECUTE format('CREATE INDEX idx_agenda_citas_responsable ON %I.agenda_citas (empresa_id, responsable_id, inicio_at)', v_schema);
    EXECUTE format('CREATE INDEX idx_agenda_citas_cliente ON %I.agenda_citas (empresa_id, cliente_id)', v_schema);
    EXECUTE format('CREATE INDEX idx_agenda_citas_estado ON %I.agenda_citas (empresa_id, estado)', v_schema);

    v_creadas := v_creadas || 'agenda_citas'::text;
  END IF;

  -- ── agenda_cita_responsables ─────────────────────────────────────────────
  -- Quién más va además del responsable principal. El código la trata como
  -- opcional, pero sin ella el filtro "mis citas" cae al responsable solo.
  IF to_regclass(v_schema || '.agenda_cita_responsables') IS NULL THEN
    EXECUTE format($f$
      CREATE TABLE %I.agenda_cita_responsables (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id  uuid NOT NULL,
        cita_id     uuid NOT NULL,
        usuario_id  uuid NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        -- La misma persona una sola vez por cita: el guardado borra y reinserta.
        CONSTRAINT agenda_cita_responsables_unico UNIQUE (cita_id, usuario_id)
      )
    $f$, v_schema);

    EXECUTE format(
      'ALTER TABLE %I.agenda_cita_responsables ADD CONSTRAINT agenda_cita_resp_cita_fk '
      || 'FOREIGN KEY (cita_id) REFERENCES %I.agenda_citas(id) ON DELETE CASCADE',
      v_schema, v_schema);
    EXECUTE format(
      'ALTER TABLE %I.agenda_cita_responsables ADD CONSTRAINT agenda_cita_resp_usuario_fk '
      || 'FOREIGN KEY (usuario_id) REFERENCES %I.usuarios(id) ON DELETE CASCADE',
      v_schema, v_schema);
    EXECUTE format('CREATE INDEX idx_agenda_resp_usuario ON %I.agenda_cita_responsables (empresa_id, usuario_id)', v_schema);

    v_creadas := v_creadas || 'agenda_cita_responsables'::text;
  END IF;

  -- RLS prendida y sin policies: el ERP entra con la service role, que la
  -- saltea. Sin esto, la clave anónima podría leer la agenda de la empresa
  -- desde afuera, porque el schema está expuesto en PostgREST.
  EXECUTE format('ALTER TABLE %I.agenda_citas ENABLE ROW LEVEL SECURITY', v_schema);
  EXECUTE format('ALTER TABLE %I.agenda_cita_responsables ENABLE ROW LEVEL SECURITY', v_schema);

  IF array_length(v_creadas, 1) IS NULL THEN
    RAISE NOTICE 'agenda: las dos tablas ya existían, no se creó nada.';
  ELSE
    RAISE NOTICE 'agenda: creadas %.', array_to_string(v_creadas, ', ');
  END IF;
END;
$$;

-- ── Verificación ───────────────────────────────────────────────────────────
SELECT c.relname AS tabla, c.relrowsecurity AS rls_prendida,
       (SELECT count(*) FROM pg_index i WHERE i.indrelid = c.oid) AS indices
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'distribuidorajmerp'
   AND c.relname IN ('agenda_citas', 'agenda_cita_responsables')
 ORDER BY c.relname;
