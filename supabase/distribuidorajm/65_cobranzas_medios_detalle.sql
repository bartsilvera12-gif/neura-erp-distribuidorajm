-- SQL 65 · Datos específicos del medio de cobro
--
-- Para que desde Cobranzas se puedan registrar los 4 medios con la info que
-- hoy se pierde:
--   - Transferencia: desde qué banco vino
--   - Cheque: número, fecha de emisión y fecha de cobro
-- El pago mixto no necesita columnas nuevas: se guarda como N movimientos
-- (uno por medio), igual que las ventas mixtas de la caja.
--
-- Columnas lazy: el server las detecta en runtime y las omite si no corrió
-- este SQL. Sin la migración el sistema sigue andando (los datos van a parar
-- a `observacion`). Con la migración quedan en columnas consultables.

ALTER TABLE distribuidorajmerp.caja_movimientos
  ADD COLUMN IF NOT EXISTS banco_origen text,
  ADD COLUMN IF NOT EXISTS numero_cheque text,
  ADD COLUMN IF NOT EXISTS fecha_emision_cheque date,
  ADD COLUMN IF NOT EXISTS fecha_cobro_cheque date;
