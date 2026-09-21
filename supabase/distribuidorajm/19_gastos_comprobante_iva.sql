-- ============================================================================
-- 19. Gastos y Servicios: comprobante e IVA
-- ============================================================================
--
-- La pantalla fallaba con "No se pudieron cargar los gastos y servicios": la
-- tabla `gastos` de este schema tiene siete columnas —categoría, descripción,
-- monto, fecha— y el módulo pide una cabecera fiscal completa, líneas y un
-- correlativo. Faltaban 23 columnas y 2 tablas.
--
-- Esto es la fase 1 del módulo, adaptada a este schema: comprobante, timbrado,
-- IVA discriminado, condición de pago y vencimiento, y el ciclo borrador →
-- confirmado → anulado. NO trae el motor contable (fase 2): no hay plan de
-- cuentas, ni imputación, ni asientos.
--
-- `estado_contable`, `asiento_contable_id` y `cuenta_contrapartida_id` se
-- agregan igual, vacías. El código las lee en su SELECT y sin ellas la consulta
-- falla entera; con ellas la pantalla anda y quedan sin usar hasta que haya
-- contabilidad de verdad. Lo mismo `cuenta_contable_id` en las líneas, que va
-- sin clave foránea porque `plan_cuentas` no existe acá.
--
-- Los gastos que ya estén cargados quedan como 'historico': no se les inventan
-- datos fiscales que nadie escribió.
--
-- Idempotente. Solo agrega; no borra ni pisa datos.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_schema text := 'distribuidorajmerp';
BEGIN
  IF to_regclass(v_schema || '.gastos') IS NULL THEN
    RAISE EXCEPTION 'no existe %.gastos', v_schema;
  END IF;
  IF to_regclass(v_schema || '.proveedores') IS NULL THEN
    RAISE EXCEPTION 'no existe %.proveedores: el gasto se imputa a un proveedor', v_schema;
  END IF;
END $$;

-- ── 1) Cabecera fiscal ──────────────────────────────────────────────────────
ALTER TABLE distribuidorajmerp.gastos
  ADD COLUMN IF NOT EXISTS proveedor_id       uuid REFERENCES distribuidorajmerp.proveedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS numero             text,
  ADD COLUMN IF NOT EXISTS tipo_comprobante   text,
  ADD COLUMN IF NOT EXISTS numero_comprobante text,
  ADD COLUMN IF NOT EXISTS timbrado           text,
  ADD COLUMN IF NOT EXISTS fecha_comprobante  date,
  ADD COLUMN IF NOT EXISTS fecha_contable     date,
  ADD COLUMN IF NOT EXISTS tipo_pago          text,
  ADD COLUMN IF NOT EXISTS plazo_dias         integer,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento  date,
  ADD COLUMN IF NOT EXISTS moneda             text,
  ADD COLUMN IF NOT EXISTS tipo_cambio        numeric,
  ADD COLUMN IF NOT EXISTS subtotal           numeric,
  ADD COLUMN IF NOT EXISTS monto_iva          numeric,
  ADD COLUMN IF NOT EXISTS total              numeric,
  ADD COLUMN IF NOT EXISTS estado             text,
  ADD COLUMN IF NOT EXISTS confirmado_at      timestamptz,
  ADD COLUMN IF NOT EXISTS confirmado_by      uuid,
  ADD COLUMN IF NOT EXISTS anulado_at         timestamptz,
  ADD COLUMN IF NOT EXISTS anulado_by         uuid,
  ADD COLUMN IF NOT EXISTS motivo_anulacion   text,
  ADD COLUMN IF NOT EXISTS idempotency_key    uuid,
  -- El alta la escribe con 'variable'; el Estado de Cuenta la lee.
  ADD COLUMN IF NOT EXISTS tipo               text,
  ADD COLUMN IF NOT EXISTS updated_at         timestamptz NOT NULL DEFAULT now(),
  -- Inertes: el código las lee, la contabilidad no está construida.
  ADD COLUMN IF NOT EXISTS estado_contable         text,
  ADD COLUMN IF NOT EXISTS asiento_contable_id     uuid,
  ADD COLUMN IF NOT EXISTS cuenta_contrapartida_id uuid;

-- Lo que ya estaba cargado no tiene datos fiscales: queda como histórico.
UPDATE distribuidorajmerp.gastos SET estado = 'historico' WHERE estado IS NULL;
ALTER TABLE distribuidorajmerp.gastos ALTER COLUMN estado SET DEFAULT 'borrador';
ALTER TABLE distribuidorajmerp.gastos ALTER COLUMN estado SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname='gastos_estado_chk'
                    AND conrelid='distribuidorajmerp.gastos'::regclass) THEN
    ALTER TABLE distribuidorajmerp.gastos ADD CONSTRAINT gastos_estado_chk
      CHECK (estado IN ('borrador','confirmado','anulado','historico'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname='gastos_tipo_pago_chk'
                    AND conrelid='distribuidorajmerp.gastos'::regclass) THEN
    ALTER TABLE distribuidorajmerp.gastos ADD CONSTRAINT gastos_tipo_pago_chk
      CHECK (tipo_pago IS NULL OR tipo_pago IN ('contado','credito'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gastos_numero
  ON distribuidorajmerp.gastos (empresa_id, numero) WHERE numero IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_gastos_idempotency_key
  ON distribuidorajmerp.gastos (empresa_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_gastos_estado      ON distribuidorajmerp.gastos (empresa_id, estado);
CREATE INDEX IF NOT EXISTS ix_gastos_fecha_compr ON distribuidorajmerp.gastos (empresa_id, fecha_comprobante);
CREATE INDEX IF NOT EXISTS ix_gastos_proveedor   ON distribuidorajmerp.gastos (empresa_id, proveedor_id);

-- ── 2) `updated_at` al día ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION distribuidorajmerp.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS tr_gastos_updated ON distribuidorajmerp.gastos;
CREATE TRIGGER tr_gastos_updated BEFORE UPDATE ON distribuidorajmerp.gastos
  FOR EACH ROW EXECUTE FUNCTION distribuidorajmerp.set_updated_at();

-- ── 3) Líneas del documento ─────────────────────────────────────────────────
-- `cuenta_contable_id` sin clave foránea: `plan_cuentas` no existe en este
-- schema. La columna queda para el día que haya contabilidad.
CREATE TABLE IF NOT EXISTS distribuidorajmerp.gasto_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL,
  gasto_id           uuid NOT NULL REFERENCES distribuidorajmerp.gastos(id) ON DELETE CASCADE,
  descripcion        text NOT NULL,
  cuenta_contable_id uuid,
  subtotal           numeric NOT NULL DEFAULT 0,
  iva_tipo           text NOT NULL DEFAULT 'exenta' CHECK (iva_tipo IN ('exenta','5','10')),
  monto_iva          numeric NOT NULL DEFAULT 0,
  total_linea        numeric NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_gasto_items_gasto   ON distribuidorajmerp.gasto_items (gasto_id);
CREATE INDEX IF NOT EXISTS ix_gasto_items_empresa ON distribuidorajmerp.gasto_items (empresa_id);

DROP TRIGGER IF EXISTS tr_gasto_items_updated ON distribuidorajmerp.gasto_items;
CREATE TRIGGER tr_gasto_items_updated BEFORE UPDATE ON distribuidorajmerp.gasto_items
  FOR EACH ROW EXECUTE FUNCTION distribuidorajmerp.set_updated_at();

-- ── 3b) Plan de cuentas, vacío ──────────────────────────────────────────────
-- No es contabilidad: es la tabla mínima para que el detalle de un gasto no se
-- caiga. El código la trae con LEFT JOIN para mostrar a qué cuenta se imputó
-- cada línea, y sin la tabla esa consulta falla aunque no haya ninguna cuenta.
-- Queda vacía; cuando haya contabilidad se llena y todo lo demás ya funciona.
CREATE TABLE IF NOT EXISTS distribuidorajmerp.plan_cuentas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL,
  cuenta       text NOT NULL,
  denominacion text NOT NULL,
  activo       boolean NOT NULL DEFAULT true,
  asentable    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_plan_cuentas_empresa_cuenta UNIQUE (empresa_id, cuenta)
);

DROP TRIGGER IF EXISTS tr_plan_cuentas_updated ON distribuidorajmerp.plan_cuentas;
CREATE TRIGGER tr_plan_cuentas_updated BEFORE UPDATE ON distribuidorajmerp.plan_cuentas
  FOR EACH ROW EXECUTE FUNCTION distribuidorajmerp.set_updated_at();

-- ── 4) Correlativo GS-000001 ────────────────────────────────────────────────
-- La función vive en ESTE schema, no en el de la agencia: el ERP es
-- independiente y no debe depender de otro schema para numerar un gasto.
CREATE TABLE IF NOT EXISTS distribuidorajmerp.gasto_correlativos (
  empresa_id    uuid PRIMARY KEY,
  prefijo       text NOT NULL DEFAULT 'GS-',
  ultimo_numero bigint NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION distribuidorajmerp.next_numero_gasto_empresa(p_empresa_id uuid)
RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v_num bigint;
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'next_numero_gasto_empresa: empresa_id es obligatorio';
  END IF;
  INSERT INTO distribuidorajmerp.gasto_correlativos (empresa_id, ultimo_numero)
  VALUES (p_empresa_id, 0) ON CONFLICT (empresa_id) DO NOTHING;

  UPDATE distribuidorajmerp.gasto_correlativos c
     SET ultimo_numero = c.ultimo_numero + 1, updated_at = now()
   WHERE c.empresa_id = p_empresa_id
   RETURNING c.ultimo_numero INTO v_num;

  IF v_num IS NULL THEN
    RAISE EXCEPTION 'No se pudo reservar correlativo de gasto';
  END IF;
  RETURN 'GS-' || lpad(v_num::text, 6, '0');
END;
$f$;

-- ── 5) Permisos y RLS, copiados de `gastos` ─────────────────────────────────
-- Mismo criterio que el 17: en vez de escribir roles fijos, se copia lo que ya
-- tiene la tabla que el ERP usa sin problemas.
DO $$
DECLARE
  v_schema text := 'distribuidorajmerp';
  v_tabla  text;
  r        record;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY['gasto_items','gasto_correlativos','plan_cuentas'] LOOP
    FOR r IN
      SELECT DISTINCT grantee, privilege_type
        FROM information_schema.role_table_grants
       WHERE table_schema = v_schema AND table_name = 'gastos' AND grantee <> 'PUBLIC'
    LOOP
      EXECUTE format('GRANT %s ON TABLE %I.%I TO %I', r.privilege_type, v_schema, v_tabla, r.grantee);
    END LOOP;
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', v_schema, v_tabla);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION distribuidorajmerp.next_numero_gasto_empresa(uuid) TO service_role, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
SELECT 'columnas que faltan' AS chequeo,
       coalesce(string_agg(c.columna, ', '), '(ninguna)') AS resultado
FROM (VALUES
  ('numero'),('estado'),('proveedor_id'),('tipo_comprobante'),('numero_comprobante'),
  ('timbrado'),('fecha_comprobante'),('fecha_contable'),('tipo_pago'),('plazo_dias'),
  ('fecha_vencimiento'),('moneda'),('tipo_cambio'),('subtotal'),('monto_iva'),('total'),
  ('confirmado_at'),('anulado_at'),('motivo_anulacion'),('estado_contable'),
  ('asiento_contable_id'),('cuenta_contrapartida_id'),('updated_at'),('idempotency_key'),('tipo')
) AS c(columna)
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns ic
   WHERE ic.table_schema='distribuidorajmerp' AND ic.table_name='gastos' AND ic.column_name=c.columna)
UNION ALL
SELECT 'tablas nuevas',
       string_agg(t.objeto || '=' || CASE WHEN to_regclass('distribuidorajmerp.'||t.objeto) IS NULL
                                          THEN 'FALTA' ELSE 'ok' END, ', ')
  FROM (VALUES ('gasto_items'),('gasto_correlativos'),('plan_cuentas')) AS t(objeto)
UNION ALL
-- No se llama a next_numero_gasto_empresa() acá: reservaría un correlativo de
-- verdad y el primer gasto real arrancaría en GS-000002.
SELECT 'numeracion lista',
       CASE WHEN to_regproc('distribuidorajmerp.next_numero_gasto_empresa') IS NULL
            THEN 'FALTA la función' ELSE 'ok, el proximo sera GS-' ||
                 lpad((COALESCE((SELECT max(ultimo_numero) FROM distribuidorajmerp.gasto_correlativos), 0) + 1)::text, 6, '0')
       END;
