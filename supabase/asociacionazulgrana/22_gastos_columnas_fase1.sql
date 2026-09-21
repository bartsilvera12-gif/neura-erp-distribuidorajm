-- =============================================================================
-- 22 · Agregar columnas Fase 1 (gastos/servicios) faltantes a gastos
-- =============================================================================
-- Error concreto de QA:
--   /reportes/libro-compras → column g.proveedor_id does not exist
--
-- La tabla `gastos` original solo tenía (categoria, descripcion, monto, tipo,
-- recurrente, frecuencia, fecha). La Fase 1 (migración 20260715 sobre `neura`)
-- la extendió con 20+ columnas fiscales/contables. Nunca corrió sobre nuestro
-- tenant.
--
-- Este script agrega TODAS las columnas de la Fase 1. Idempotente.
-- No pisa los 39 gastos históricos ya cargados por el SQL 12.
-- =============================================================================

ALTER TABLE asociacionazulgranaerp.gastos
  ADD COLUMN IF NOT EXISTS proveedor_id       uuid REFERENCES asociacionazulgranaerp.proveedores(id) ON DELETE SET NULL,
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
  ADD COLUMN IF NOT EXISTS updated_at         timestamptz NOT NULL DEFAULT now();

-- Los gastos historicos importados por el 12 quedan como 'historico' (sin datos
-- fiscales), y arrancamos nuevos gastos como 'borrador' hasta que se confirmen.
UPDATE asociacionazulgranaerp.gastos SET estado = 'historico' WHERE estado IS NULL;
ALTER TABLE asociacionazulgranaerp.gastos ALTER COLUMN estado SET DEFAULT 'borrador';
ALTER TABLE asociacionazulgranaerp.gastos ALTER COLUMN estado SET NOT NULL;

-- Check constraint del estado (idempotente)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='gastos_estado_chk'
      AND conrelid='asociacionazulgranaerp.gastos'::regclass
  ) THEN
    ALTER TABLE asociacionazulgranaerp.gastos ADD CONSTRAINT gastos_estado_chk
      CHECK (estado IN ('borrador','confirmado','anulado','historico'));
  END IF;
END $$;

-- Indices utiles
CREATE INDEX IF NOT EXISTS ix_gastos_proveedor
  ON asociacionazulgranaerp.gastos (empresa_id, proveedor_id);
CREATE INDEX IF NOT EXISTS ix_gastos_fecha_comprobante
  ON asociacionazulgranaerp.gastos (empresa_id, fecha_comprobante);
CREATE INDEX IF NOT EXISTS ix_gastos_estado
  ON asociacionazulgranaerp.gastos (empresa_id, estado);

-- Proveedores: agregar razon_social por si falta.
ALTER TABLE asociacionazulgranaerp.proveedores
  ADD COLUMN IF NOT EXISTS razon_social text;

NOTIFY pgrst, 'reload schema';

-- Verificacion
SELECT
  count(*) FILTER (WHERE column_name IN (
    'proveedor_id','numero','tipo_comprobante','numero_comprobante','timbrado',
    'fecha_comprobante','fecha_contable','tipo_pago','plazo_dias','fecha_vencimiento',
    'moneda','tipo_cambio','subtotal','monto_iva','total','estado',
    'confirmado_at','confirmado_by','anulado_at','anulado_by','motivo_anulacion','updated_at'
  ))::text || ' / 22'   AS columnas_gastos_ok
FROM information_schema.columns
WHERE table_schema='asociacionazulgranaerp' AND table_name='gastos';
