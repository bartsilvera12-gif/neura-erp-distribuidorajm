-- =============================================================================
-- 40b · BORRAR DATOS DE PRUEBA — IRREVERSIBLE
--
-- Correr 40a antes y revisar lo que muestra.
--
-- BORRA: ventas, facturas, notas de crédito, cobros, pagos, cajas y sus
--   movimientos, repartos, compras, órdenes de compra, recepciones, gastos,
--   movimientos y stock de inventario, asientos contables, devoluciones,
--   agenda, CRM, y además CLIENTES, PRODUCTOS, PROVEEDORES y CAMIONES (con
--   las ubicaciones de inventario de los camiones).
--
-- CONSERVA: la empresa, los usuarios, los bancos, los módulos, la
--   configuración (facturación, SIFEN, contable, plan de cuentas), las
--   categorías de productos y las ubicaciones fijas (depósito, salón).
--
-- NO reinicia la numeración de facturas, gastos, órdenes ni recepciones: si
--   algún comprobante de prueba salió con número de timbrado, reusar ese
--   número sería un problema con la SET. La numeración sigue desde donde está.
--
-- Todo o nada: corre en una sola transacción. Si algo lo bloquea (una tabla
-- que no está en la lista y apunta a estos datos), se cancela ENTERO y no se
-- borra nada; el error dice qué tabla fue.
--
-- Solo toca distribuidorajmerp.
-- =============================================================================

DO $$
DECLARE
  pendientes text[];
  elegida    text;
  borradas   bigint;
  vuelta     int := 0;
BEGIN
  -- Solo las tablas de la lista que existen en este schema.
  SELECT array_agg(t) INTO pendientes
    FROM unnest(ARRAY['ventas_items','ventas','factura_items','facturas','factura_electronica_evento','factura_electronica','nota_credito_evento','nota_credito_electronica','nota_credito','cobros_pendientes','cobranza_promesas','pagos','caja_movimientos','cajas','reparto_stock','reparto_devoluciones','repartos','compra_items','compras','orden_compra_items','ordenes_compra','recepcion_items','recepciones','gasto_items','gastos','movimientos_inventario','inventario_stock_ubicacion','asientos_contables_detalles','asientos_contables','devoluciones_venta_items','devoluciones_venta','agenda_cita_responsables','agenda_citas','crm_notas','crm_prospectos','cliente_historial','cliente_obligaciones_tributarias','cliente_perfil_tributario','suscripciones','producto_categorias','proveedor_categoria_rel','clientes','productos','proveedores','camiones']) AS t
   WHERE to_regclass('distribuidorajmerp.' || t) IS NOT NULL;

  -- Orden: se borra una tabla recién cuando ninguna otra pendiente la
  -- referencia (primero los detalles, después las cabeceras). El orden sale
  -- de las claves foráneas reales de la base, no de una lista escrita a mano.
  WHILE coalesce(array_length(pendientes, 1), 0) > 0 LOOP
    vuelta := vuelta + 1;
    IF vuelta > 200 THEN
      RAISE EXCEPTION 'No se pudo ordenar el borrado (dependencia circular entre: %). No se borró nada.', pendientes;
    END IF;

    SELECT p INTO elegida
      FROM unnest(pendientes) AS p
     WHERE NOT EXISTS (
       SELECT 1
         FROM pg_constraint c
        WHERE c.contype = 'f'
          AND c.confrelid = ('distribuidorajmerp.' || p)::regclass
          AND c.conrelid <> c.confrelid
          AND c.conrelid IN (SELECT ('distribuidorajmerp.' || q)::regclass
                               FROM unnest(pendientes) AS q WHERE q <> p)
     )
     LIMIT 1;

    IF elegida IS NULL THEN
      RAISE EXCEPTION 'Dependencia circular entre: %. No se borró nada.', pendientes;
    END IF;

    EXECUTE format('DELETE FROM distribuidorajmerp.%I', elegida);
    GET DIAGNOSTICS borradas = ROW_COUNT;
    RAISE NOTICE '%: % filas borradas', elegida, borradas;
    pendientes := array_remove(pendientes, elegida);
  END LOOP;

  -- Las ubicaciones de inventario de los camiones ya no tienen camión.
  IF to_regclass('distribuidorajmerp.inventario_ubicaciones') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'distribuidorajmerp'
                    AND table_name = 'inventario_ubicaciones' AND column_name = 'tipo') THEN
    DELETE FROM distribuidorajmerp.inventario_ubicaciones WHERE tipo = 'camion';
    GET DIAGNOSTICS borradas = ROW_COUNT;
    RAISE NOTICE 'inventario_ubicaciones (camiones): % filas borradas', borradas;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

-- Verificación: todas tienen que dar 0.
WITH lista(tabla) AS (SELECT unnest(ARRAY['ventas_items','ventas','factura_items','facturas','factura_electronica_evento','factura_electronica','nota_credito_evento','nota_credito_electronica','nota_credito','cobros_pendientes','cobranza_promesas','pagos','caja_movimientos','cajas','reparto_stock','reparto_devoluciones','repartos','compra_items','compras','orden_compra_items','ordenes_compra','recepcion_items','recepciones','gasto_items','gastos','movimientos_inventario','inventario_stock_ubicacion','asientos_contables_detalles','asientos_contables','devoluciones_venta_items','devoluciones_venta','agenda_cita_responsables','agenda_citas','crm_notas','crm_prospectos','cliente_historial','cliente_obligaciones_tributarias','cliente_perfil_tributario','suscripciones','producto_categorias','proveedor_categoria_rel','clientes','productos','proveedores','camiones']))
SELECT l.tabla,
       (xpath('/row/n/text()',
              query_to_xml(format('SELECT count(*) AS n FROM distribuidorajmerp.%I', l.tabla),
                           false, true, '')))[1]::text::bigint AS filas_que_quedan
  FROM lista l
 WHERE to_regclass('distribuidorajmerp.' || l.tabla) IS NOT NULL
 ORDER BY filas_que_quedan DESC, l.tabla;
