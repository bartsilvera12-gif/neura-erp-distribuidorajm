-- =============================================================================
-- 06 · NO EJECUTAR — reemplazado
-- =============================================================================
-- Este script creaba `repartos`, `reparto_items` y `camiones` desde cero.
-- Estaba mal: el schema YA tiene el dominio de repartos completo —
-- `repartos`, `camiones`, `reparto_stock`, `reparto_devoluciones` y el módulo
-- `devoluciones_venta*`— y correrlo generaba tablas paralelas a las que ya
-- están, o chocaba contra columnas que no coinciden.
--
-- Se deja como no-op y no se borra para que quede el rastro: si alguien vuelve
-- a este archivo desde el historial, tiene que leer esto antes.
--
-- El control de mercadería se engancha a las tablas existentes. Ver
-- DEPLOY_DISTRIBUIDORAJM.md.
-- =============================================================================

DO $$
BEGIN
  RAISE EXCEPTION
    'No ejecutar 06_repartos.sql: el schema ya tiene el dominio de repartos. Ver el encabezado del archivo.';
END;
$$;
