-- =============================================================================
-- 40a · PREVIA del borrado de datos de prueba — SOLO LECTURA, no borra nada.
--
-- Correr ANTES de 40b. Muestra:
--   1. Cuántas filas se van a borrar de cada tabla.
--   2. Si alguna OTRA tabla (que no está en la lista) tiene filas que apuntan a
--      esos datos. Si aparece alguna acá, 40b se va a cancelar entero sin borrar
--      nada: mandame esa lista y la ajusto.
--
-- Solo mira distribuidorajmerp.
-- =============================================================================

WITH lista(tabla) AS (
  SELECT unnest(ARRAY['ventas_items','ventas','factura_items','facturas','factura_electronica_evento','factura_electronica','nota_credito_evento','nota_credito_electronica','nota_credito','cobros_pendientes','cobranza_promesas','pagos','caja_movimientos','cajas','reparto_stock','reparto_devoluciones','repartos','compra_items','compras','orden_compra_items','ordenes_compra','recepcion_items','recepciones','gasto_items','gastos','movimientos_inventario','inventario_stock_ubicacion','asientos_contables_detalles','asientos_contables','devoluciones_venta_items','devoluciones_venta','agenda_cita_responsables','agenda_citas','crm_notas','crm_prospectos','cliente_historial','cliente_obligaciones_tributarias','cliente_perfil_tributario','suscripciones','producto_categorias','proveedor_categoria_rel','clientes','productos','proveedores','camiones'])
)
SELECT '1 · se borra' AS seccion,
       l.tabla,
       (xpath('/row/n/text()',
              query_to_xml(format('SELECT count(*) AS n FROM distribuidorajmerp.%I', l.tabla),
                           false, true, '')))[1]::text::bigint AS filas
  FROM lista l
 WHERE to_regclass('distribuidorajmerp.' || l.tabla) IS NOT NULL

UNION ALL

-- Tablas fuera de la lista que tienen una FK hacia la lista y NO se borran
-- solas (ON DELETE NO ACTION / RESTRICT). Con filas, bloquearían el borrado.
SELECT '2 · BLOQUEARIA (avisame)' AS seccion,
       format('%s.%s → %s', c.conrelid::regclass, a.attname, c.confrelid::regclass) AS tabla,
       (xpath('/row/n/text()',
              query_to_xml(format('SELECT count(*) AS n FROM %s WHERE %I IS NOT NULL',
                                  c.conrelid::regclass, a.attname),
                           false, true, '')))[1]::text::bigint AS filas
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  JOIN pg_namespace n ON n.oid = (SELECT relnamespace FROM pg_class WHERE oid = c.conrelid)
 WHERE c.contype = 'f'
   AND c.confdeltype IN ('a', 'r')
   AND n.nspname = 'distribuidorajmerp'
   AND (SELECT relname FROM pg_class WHERE oid = c.confrelid) IN (SELECT tabla FROM lista)
   AND (SELECT relname FROM pg_class WHERE oid = c.conrelid) NOT IN (SELECT tabla FROM lista)

UNION ALL

-- Facturas electrónicas: borrarlas acá NO las anula en la SET.
SELECT '3 · facturas electrónicas enviadas a la SET' AS seccion,
       'factura_electronica' AS tabla,
       CASE WHEN to_regclass('distribuidorajmerp.factura_electronica') IS NULL THEN 0
            ELSE (xpath('/row/n/text()',
                        query_to_xml('SELECT count(*) AS n FROM distribuidorajmerp.factura_electronica',
                                     false, true, '')))[1]::text::bigint
       END AS filas

ORDER BY seccion, tabla;
