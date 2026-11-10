-- SQL 63 · Metas por unidades y kilos + quién aplicó el descuento
-- Solo schema distribuidorajmerp. Correr después del SQL 61 y del SQL 62.

-- 1) Metas: además de guaraníes, en unidades o en kilos, y opcionalmente de un producto.
ALTER TABLE distribuidorajmerp.metas_ventas_mensuales
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'guaranies',
  ADD COLUMN IF NOT EXISTS producto_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'metas_ventas_mensuales_tipo_check'
       AND conrelid = 'distribuidorajmerp.metas_ventas_mensuales'::regclass
  ) THEN
    ALTER TABLE distribuidorajmerp.metas_ventas_mensuales
      ADD CONSTRAINT metas_ventas_mensuales_tipo_check CHECK (tipo IN ('guaranies', 'unidades', 'kilos'));
  END IF;
END $$;

-- La meta ya no es una sola por mes y persona: puede haber una de guaraníes,
-- una de unidades, una de kilos y una por producto.
ALTER TABLE distribuidorajmerp.metas_ventas_mensuales
  DROP CONSTRAINT IF EXISTS metas_ventas_mensuales_empresa_id_mes_clave_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_metas_ventas_mes_clave_tipo_producto
  ON distribuidorajmerp.metas_ventas_mensuales
     (empresa_id, mes, clave, tipo, COALESCE(producto_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 2) Ventas: quién aplicó el descuento (para el cierre de caja).
ALTER TABLE distribuidorajmerp.ventas
  ADD COLUMN IF NOT EXISTS descuento_usuario text;
