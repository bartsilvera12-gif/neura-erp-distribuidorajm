-- SQL 62 · Descuento en ventas
-- Solo schema distribuidorajmerp. Guarda cuánto se descontó en cada venta.
-- La venta (total, líneas, caja) ya queda por lo realmente cobrado; estas
-- columnas son para ver y sumar los descuentos. Sin este SQL el descuento
-- igual funciona y queda escrito en las observaciones de la venta.
ALTER TABLE distribuidorajmerp.ventas
  ADD COLUMN IF NOT EXISTS descuento_monto numeric NOT NULL DEFAULT 0 CHECK (descuento_monto >= 0),
  ADD COLUMN IF NOT EXISTS descuento_porcentaje numeric NOT NULL DEFAULT 0 CHECK (descuento_porcentaje >= 0);
