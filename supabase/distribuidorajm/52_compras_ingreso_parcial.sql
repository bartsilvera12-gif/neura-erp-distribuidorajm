-- =============================================================================
-- 52 · COMPRAS: FECHA DE VENCIMIENTO, CAMIÓN QUE TRANSPORTÓ E INGRESO PARCIAL
-- =============================================================================
-- Punto 7 de la solicitud del 23/10/2026.
--
--  · compras.fecha_vencimiento: vencimiento de la factura del proveedor.
--  · compras.camion_transporte_id: el camión que trajo la mercadería.
--  · compras.destino_ubicacion_id: adónde entra la mercadería (camión) o NULL
--    (salón). Hace falta para ingresar después lo que quedó pendiente.
--  · compra_items.cantidad_ingresada: cuánto de la línea ya entró al stock.
--    NULL = compra anterior a este SQL (entró todo).
--
-- Solo toca `distribuidorajmerp`. Idempotente.
-- =============================================================================

ALTER TABLE distribuidorajmerp.compras
  ADD COLUMN IF NOT EXISTS fecha_vencimiento date,
  ADD COLUMN IF NOT EXISTS camion_transporte_id uuid,
  ADD COLUMN IF NOT EXISTS destino_ubicacion_id uuid;

ALTER TABLE distribuidorajmerp.compra_items
  ADD COLUMN IF NOT EXISTS cantidad_ingresada numeric;

DO $chk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'compra_items_cantidad_ingresada_chk'
       AND conrelid = 'distribuidorajmerp.compra_items'::regclass
  ) THEN
    ALTER TABLE distribuidorajmerp.compra_items
      ADD CONSTRAINT compra_items_cantidad_ingresada_chk
      CHECK (cantidad_ingresada IS NULL OR (cantidad_ingresada >= 0 AND cantidad_ingresada <= cantidad));
  END IF;
END;
$chk$;

SELECT pg_notify('pgrst', 'reload schema');

SELECT table_name, column_name FROM information_schema.columns
 WHERE table_schema = 'distribuidorajmerp'
   AND ((table_name = 'compras' AND column_name IN ('fecha_vencimiento', 'camion_transporte_id', 'destino_ubicacion_id'))
     OR (table_name = 'compra_items' AND column_name = 'cantidad_ingresada'))
 ORDER BY 1, 2;
