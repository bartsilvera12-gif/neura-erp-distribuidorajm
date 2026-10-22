-- =============================================================================
-- 48 · SENCILLO DE LA CAJA
-- =============================================================================
-- El sencillo (billetes chicos y monedas para dar cambio) que el cajero tiene
-- en el cajón y que no entra por ventas. Se carga en el arqueo o al cerrar la
-- caja, y suma al efectivo esperado: sin esto, el cambio aparecía como
-- sobrante en la diferencia.
--
-- Solo toca `distribuidorajmerp`. Idempotente.
-- =============================================================================

ALTER TABLE distribuidorajmerp.cajas
  ADD COLUMN IF NOT EXISTS sencillo numeric NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';

SELECT numero_caja, estado, monto_apertura, sencillo
  FROM distribuidorajmerp.cajas
 ORDER BY fecha_apertura DESC
 LIMIT 5;
