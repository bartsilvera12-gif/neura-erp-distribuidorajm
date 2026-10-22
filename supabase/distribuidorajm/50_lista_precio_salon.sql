-- =============================================================================
-- 50 · LISTA DE PRECIO DEL SALÓN
-- =============================================================================
-- Igual que cada camión (SQL 47), el salón vende con una lista: minorista o
-- mayorista. Se elige en la compra con destino Salón, y la caja del salón la
-- usa sin preguntar. Arranca en minorista.
--
-- Solo toca `distribuidorajmerp`. Idempotente.
-- =============================================================================

ALTER TABLE distribuidorajmerp.empresas
  ADD COLUMN IF NOT EXISTS lista_precio_salon text NOT NULL DEFAULT 'minorista';

DO $salon$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'empresas_lista_precio_salon_chk'
       AND conrelid = 'distribuidorajmerp.empresas'::regclass
  ) THEN
    ALTER TABLE distribuidorajmerp.empresas
      ADD CONSTRAINT empresas_lista_precio_salon_chk CHECK (lista_precio_salon IN ('minorista', 'mayorista'));
  END IF;
  PERFORM pg_notify('pgrst', 'reload schema');
END;
$salon$;

SELECT id, lista_precio_salon FROM distribuidorajmerp.empresas
 WHERE id = '058efef5-e1b5-4cab-8a65-238f81823917';
