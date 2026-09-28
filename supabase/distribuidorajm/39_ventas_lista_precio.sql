-- =============================================================================
-- 39 · ventas.lista_precio — minorista o mayorista
--
-- OPCIONAL. La caja ya aplica el precio mayorista (precio de venta −10%) y el
-- servidor lo verifica sin esta columna: la factura sale bien igual. Esto solo
-- deja registrado en cada venta con qué lista se vendió, para poder separar
-- después las ventas mayoristas de las minoristas en reportes.
--
-- Solo toca distribuidorajmerp. Idempotente: se puede correr dos veces.
-- Las ventas anteriores quedan como 'minorista', que es lo que eran.
-- =============================================================================

ALTER TABLE distribuidorajmerp.ventas
  ADD COLUMN IF NOT EXISTS lista_precio text NOT NULL DEFAULT 'minorista';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'distribuidorajmerp.ventas'::regclass
       AND conname = 'ventas_lista_precio_check'
  ) THEN
    ALTER TABLE distribuidorajmerp.ventas
      ADD CONSTRAINT ventas_lista_precio_check
      CHECK (lista_precio IN ('minorista', 'mayorista'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verificación (solo lectura): tiene que devolver una fila con la columna.
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_schema = 'distribuidorajmerp' AND table_name = 'ventas'
   AND column_name = 'lista_precio';
