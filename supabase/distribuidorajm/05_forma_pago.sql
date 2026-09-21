-- =============================================================================
-- 05 · NO EJECUTAR — reemplazado por el 07
-- =============================================================================
-- Este script agregaba `ventas.forma_pago` con un CHECK de
-- ('efectivo','transferencia','cheque','credito').
--
-- Estaba mal: `ventas` YA tiene `metodo_pago`, y `forma_pago` mezclaba dos
-- cosas distintas — el medio de cobro y `tipo_venta` (CONTADO/CREDITO), que ya
-- es una columna aparte. Además se perdía `tarjeta`, que sí existe en el
-- vocabulario real del ERP.
--
-- El 07 (`07_metodo_pago.sql`) es la corrección: borra `forma_pago` si este
-- script llegó a correr y agrega `cheque` a los CHECK que el schema ya tenía.
--
-- Se deja como no-op y no se borra para que quede el rastro: si alguien vuelve
-- a este archivo desde el historial, tiene que leer esto antes.
-- =============================================================================

DO $$
BEGIN
  RAISE EXCEPTION
    'No ejecutar 05_forma_pago.sql: ventas.metodo_pago ya cumple esa función. Corré el 07 en su lugar.';
END;
$$;
