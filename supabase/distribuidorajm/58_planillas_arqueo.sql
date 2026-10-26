-- =============================================================================
-- 58 · PLANILLAS DE ARQUEO (la hoja de cierre de los camioneros, en el sistema)
-- =============================================================================
-- El camionero completa su planilla de arqueo de caja —composición de caja,
-- facturas a crédito, cobranzas, gastos y vales, transferencias— y la envía;
-- el administrador las ve en Cobranzas → Planillas de arqueo.
--
-- Una planilla por caja. `datos` guarda la hoja tal cual se completó; las
-- columnas de totales son para listar y filtrar sin abrir cada una.
--
-- Solo toca `distribuidorajmerp`. Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS distribuidorajmerp.planillas_arqueo (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL,
  caja_id             uuid NOT NULL,
  fecha               date NOT NULL,
  usuario_id          uuid,
  responsable         text,
  camion              text,
  numero_caja         integer,
  estado              text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'enviada', 'revisada')),
  datos               jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_ventas        numeric NOT NULL DEFAULT 0,
  total_contado       numeric NOT NULL DEFAULT 0,
  total_credito       numeric NOT NULL DEFAULT 0,
  total_cobranzas     numeric NOT NULL DEFAULT 0,
  total_gastos        numeric NOT NULL DEFAULT 0,
  total_transferencias numeric NOT NULL DEFAULT 0,
  efectivo            numeric NOT NULL DEFAULT 0,
  diferencia          numeric NOT NULL DEFAULT 0,
  enviada_at          timestamptz,
  revisada_at         timestamptz,
  revisada_por        text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, caja_id)
);
CREATE INDEX IF NOT EXISTS idx_planillas_arqueo_fecha
  ON distribuidorajmerp.planillas_arqueo (empresa_id, fecha DESC);

DO $permisos$
DECLARE r record;
BEGIN
  ALTER TABLE distribuidorajmerp.planillas_arqueo ENABLE ROW LEVEL SECURITY;
  FOR r IN
    SELECT grantee, privilege_type FROM information_schema.role_table_grants
     WHERE table_schema = 'distribuidorajmerp' AND table_name = 'compras'
  LOOP
    EXECUTE format('GRANT %s ON distribuidorajmerp.planillas_arqueo TO %I', r.privilege_type, r.grantee);
  END LOOP;
END;
$permisos$;

SELECT pg_notify('pgrst', 'reload schema');

SELECT to_regclass('distribuidorajmerp.planillas_arqueo')::text AS tabla_creada;
