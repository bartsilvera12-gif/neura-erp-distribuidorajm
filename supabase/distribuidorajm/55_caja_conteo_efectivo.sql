-- =============================================================================
-- 55 · CAJA: CONTEO DEL EFECTIVO AL CERRAR (billetes y monedas)
-- =============================================================================
-- Al cerrar, el cajero carga cuántos tiene de cada billete y moneda, más el
-- sencillo y las monedas sueltas (como la planilla de arqueo). Se guarda el
-- detalle para verlo e imprimirlo en el arqueo.
--
-- Solo toca `distribuidorajmerp`. Idempotente.
-- =============================================================================

ALTER TABLE distribuidorajmerp.cajas
  ADD COLUMN IF NOT EXISTS conteo_efectivo jsonb;

SELECT pg_notify('pgrst', 'reload schema');

SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'distribuidorajmerp' AND table_name = 'cajas' AND column_name = 'conteo_efectivo';
