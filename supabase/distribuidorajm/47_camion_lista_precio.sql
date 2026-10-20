-- =============================================================================
-- 47 · LISTA DE PRECIO DEL CAMIÓN
-- =============================================================================
-- Cada camión vende con una lista: minorista o mayorista. Se elige en la
-- compra con destino a ese camión, y el camionero ya no la elige al vender.
-- Arranca en minorista.
--
-- Solo toca `distribuidorajmerp`. Idempotente.
-- =============================================================================

ALTER TABLE distribuidorajmerp.camiones
  ADD COLUMN IF NOT EXISTS lista_precio text NOT NULL DEFAULT 'minorista';

DO $lista$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'camiones_lista_precio_chk'
       AND conrelid = 'distribuidorajmerp.camiones'::regclass
  ) THEN
    ALTER TABLE distribuidorajmerp.camiones
      ADD CONSTRAINT camiones_lista_precio_chk CHECK (lista_precio IN ('minorista', 'mayorista'));
  END IF;
  PERFORM pg_notify('pgrst', 'reload schema');
END;
$lista$;

SELECT alias, lista_precio FROM distribuidorajmerp.camiones ORDER BY alias;
