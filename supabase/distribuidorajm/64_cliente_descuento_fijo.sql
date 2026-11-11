-- SQL 64 · Descuento fijo por cliente + marca "oculto en el papel" en ventas
--
-- Caso de uso: la clienta pidió un 6% permanente a Milciades Aguilera, que se
-- aplica automáticamente al elegirlo en la caja y NO se imprime en la
-- factura/ticket (la clienta quiere mostrar solo el total a pagar, sin el
-- renglón del %). Queda registrado en descuento_monto como cualquier otro
-- descuento, así sale en el reporte de descuentos y en la planilla del arqueo.
--
-- Sin estas columnas el sistema igual anda: el POST de clientes y el INSERT
-- de ventas detectan la columna y la omiten si no está, así que agregarlas se
-- puede hacer sin ventana de mantenimiento.

ALTER TABLE distribuidorajmerp.clientes
  ADD COLUMN IF NOT EXISTS descuento_porcentaje_fijo numeric
    CHECK (descuento_porcentaje_fijo IS NULL OR (descuento_porcentaje_fijo > 0 AND descuento_porcentaje_fijo <= 10));

ALTER TABLE distribuidorajmerp.ventas
  ADD COLUMN IF NOT EXISTS descuento_oculto boolean NOT NULL DEFAULT false;
