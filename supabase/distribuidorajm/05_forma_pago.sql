-- =============================================================================
-- 05 · COLUMNA `forma_pago` EN VENTAS  (opcional pero recomendada)
-- =============================================================================
-- La Caja permite cobrar con Efectivo / Transferencia / Cheque / Crédito.
-- `tipo_venta` solo distingue CONTADO de CREDITO, así que sin esta columna los
-- tres medios de contado quedan indistinguibles y el arqueo de caja no se puede
-- desglosar.
--
-- No es bloqueante: si no corrés este script la venta se guarda igual, solo que
-- sin el medio de cobro (ver src/lib/ventas/server/create-venta-pg.ts). Cobrar
-- no depende de una migración pendiente.
--
-- Solo toca distribuidorajmerp.ventas. Idempotente.
-- =============================================================================

ALTER TABLE distribuidorajmerp.ventas
  ADD COLUMN IF NOT EXISTS forma_pago text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'distribuidorajmerp.ventas'::regclass
      AND conname = 'ventas_forma_pago_check'
  ) THEN
    ALTER TABLE distribuidorajmerp.ventas
      ADD CONSTRAINT ventas_forma_pago_check
      CHECK (forma_pago IS NULL OR forma_pago IN ('efectivo','transferencia','cheque','credito'));
  END IF;
END;
$$;

-- Una venta a crédito no puede estar cobrada en efectivo, y viceversa.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'distribuidorajmerp.ventas'::regclass
      AND conname = 'ventas_forma_pago_coherente_check'
  ) THEN
    ALTER TABLE distribuidorajmerp.ventas
      ADD CONSTRAINT ventas_forma_pago_coherente_check
      CHECK (
        forma_pago IS NULL
        OR (forma_pago = 'credito'  AND tipo_venta = 'CREDITO')
        OR (forma_pago <> 'credito' AND tipo_venta = 'CONTADO')
      );
  END IF;
END;
$$;

-- El arqueo agrupa por medio de cobro sobre las ventas del día.
CREATE INDEX IF NOT EXISTS idx_ventas_forma_pago
  ON distribuidorajmerp.ventas (empresa_id, fecha, forma_pago);

COMMENT ON COLUMN distribuidorajmerp.ventas.forma_pago IS
  'Medio de cobro: efectivo | transferencia | cheque | credito. NULL en ventas previas a la Caja nueva.';

SELECT pg_notify('pgrst', 'reload schema');
