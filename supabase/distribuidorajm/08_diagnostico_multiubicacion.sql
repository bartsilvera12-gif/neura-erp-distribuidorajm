-- =============================================================================
-- 08 · DIAGNÓSTICO DE MULTIUBICACIÓN  (SOLO LECTURA)
-- =============================================================================
-- El documento de relevamiento (v0.2) pide que el camión sea una ubicación de
-- inventario con saldo propio que continúa al día siguiente. El ERP ya tiene
-- `inventario_ubicaciones` e `inventario_stock_ubicacion`, así que la migración
-- se apoya en eso en vez de crear tablas nuevas.
--
-- Antes de escribirla hay que ver la forma real que tienen en ESTE schema:
-- sobre todo si `inventario_ubicaciones.tipo` está limitado por un CHECK, que
-- hoy en el código no incluye 'camion'.
--
-- No modifica nada. Devuelve 5 resultados.
-- =============================================================================

-- 1 · Columnas de las tablas involucradas.
SELECT table_name, ordinal_position, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'distribuidorajmerp'
   AND table_name IN ('inventario_ubicaciones', 'inventario_stock_ubicacion',
                      'movimientos_inventario', 'camiones', 'productos')
 ORDER BY table_name, ordinal_position;

-- 2 · Constraints (acá aparece el CHECK del tipo de ubicación y los únicos).
SELECT conrelid::regclass::text AS tabla, conname, pg_get_constraintdef(oid) AS definicion
  FROM pg_constraint
 WHERE conrelid IN (
         to_regclass('distribuidorajmerp.inventario_ubicaciones'),
         to_regclass('distribuidorajmerp.inventario_stock_ubicacion'),
         to_regclass('distribuidorajmerp.movimientos_inventario'),
         to_regclass('distribuidorajmerp.camiones'))
 ORDER BY tabla, conname;

-- 3 · Qué ubicaciones hay cargadas (debería estar vacío en un schema nuevo).
SELECT id, nombre, codigo, tipo, parent_id, activo
  FROM distribuidorajmerp.inventario_ubicaciones
 ORDER BY nombre;

-- 4 · Tablas del schema cuyo nombre empieza después de 'producciones':
--     la lista que me pasaste antes venía cortada ahí.
SELECT table_name
  FROM information_schema.tables
 WHERE table_schema = 'distribuidorajmerp' AND table_type = 'BASE TABLE'
   AND table_name > 'producciones'
 ORDER BY table_name;

-- 5 · Si ya existe algún dominio de lotes/vencimientos o de transferencias,
--     para no duplicarlo.
SELECT table_name
  FROM information_schema.tables
 WHERE table_schema = 'distribuidorajmerp'
   AND (table_name ILIKE '%lote%' OR table_name ILIKE '%vencim%'
     OR table_name ILIKE '%transfer%' OR table_name ILIKE '%concilia%'
     OR table_name ILIKE '%presentac%' OR table_name ILIKE '%permis%')
 ORDER BY table_name;
