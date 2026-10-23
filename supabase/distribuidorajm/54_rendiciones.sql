-- =============================================================================
-- 54 · RENDICIONES (cobros de clientes y reparto de los camiones)
-- =============================================================================
-- Punto 2 de la solicitud del 23/10/2026.
--
-- Una rendición es la entrega de la plata que cobró una persona (el chofer de
-- un camión, un cobrador, un cajero) en un período. El sistema calcula lo
-- cobrado con los movimientos de sus cajas (ventas al contado, cobros de
-- créditos, otros ingresos, menos egresos), por forma de pago; se carga lo
-- que efectivamente rindió y queda la diferencia, quién la recibió y cuándo.
--
-- `detalle` guarda la foto de lo calculado al momento de rendir (resumen y
-- movimientos), para verla igual aunque después se anule algo.
--
-- Solo toca `distribuidorajmerp`. Idempotente.
-- =============================================================================

-- Si ya hay una tabla con este nombre que no es la nuestra, se para acá con
-- un mensaje claro en vez de fallar a mitad de camino.
DO $guard$
BEGIN
  IF to_regclass('distribuidorajmerp.rendiciones_cobro') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'distribuidorajmerp' AND table_name = 'rendiciones_cobro' AND column_name = 'responsable_id'
  ) THEN
    RAISE EXCEPTION 'Ya existe distribuidorajmerp.rendiciones_cobro con otras columnas: avisá antes de seguir (no se tocó nada).';
  END IF;
END;
$guard$;

CREATE TABLE IF NOT EXISTS distribuidorajmerp.rendiciones_cobro (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL,
  numero             integer NOT NULL,
  tipo               text NOT NULL DEFAULT 'cobranza' CHECK (tipo IN ('reparto', 'cobranza')),
  responsable_id     uuid NOT NULL,
  responsable_nombre text NOT NULL,
  camion_id          uuid,
  camion_alias       text,
  desde              timestamptz NOT NULL,
  hasta              timestamptz NOT NULL,
  cobrado_total      numeric NOT NULL DEFAULT 0,
  rendido_total      numeric NOT NULL DEFAULT 0,
  diferencia         numeric NOT NULL DEFAULT 0,
  detalle            jsonb NOT NULL DEFAULT '{}'::jsonb,
  observaciones      text,
  recibido_por       text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, numero),
  CHECK (hasta >= desde)
);
CREATE INDEX IF NOT EXISTS idx_rendiciones_cobro_fecha ON distribuidorajmerp.rendiciones_cobro (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rendiciones_cobro_responsable ON distribuidorajmerp.rendiciones_cobro (empresa_id, responsable_id, hasta DESC);

DO $permisos$
DECLARE r record;
BEGIN
  ALTER TABLE distribuidorajmerp.rendiciones_cobro ENABLE ROW LEVEL SECURITY;
  FOR r IN
    SELECT grantee, privilege_type FROM information_schema.role_table_grants
     WHERE table_schema = 'distribuidorajmerp' AND table_name = 'compras'
  LOOP
    EXECUTE format('GRANT %s ON distribuidorajmerp.rendiciones_cobro TO %I', r.privilege_type, r.grantee);
  END LOOP;
END;
$permisos$;

SELECT pg_notify('pgrst', 'reload schema');

SELECT to_regclass('distribuidorajmerp.rendiciones_cobro') AS tabla_creada;
