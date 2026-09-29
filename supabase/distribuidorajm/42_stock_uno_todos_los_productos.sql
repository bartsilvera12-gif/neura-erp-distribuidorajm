-- 42 · Deja 1 unidad en el salón de cada producto activo.
--
-- Solo toca el schema distribuidorajmerp.
--
-- productos.stock_actual es el TOTAL de la empresa, y el salón se calcula como
-- ese total menos lo que está arriba de los camiones. Por eso se pone
-- 1 + lo que haya en camiones: el salón queda en 1 y los camiones no se tocan.
-- (Si no hay nada cargado en camiones, queda stock_actual = 1.)

BEGIN;

WITH en_camiones AS (
  SELECT su.producto_id, sum(su.stock_actual) AS cantidad
    FROM distribuidorajmerp.inventario_stock_ubicacion su
    JOIN distribuidorajmerp.inventario_ubicaciones u ON u.id = su.ubicacion_id
   WHERE lower(btrim(COALESCE(u.tipo, ''))) = 'camion'
   GROUP BY su.producto_id
)
UPDATE distribuidorajmerp.productos p
   SET stock_actual = 1 + COALESCE(ec.cantidad, 0)
  FROM distribuidorajmerp.productos p2
  LEFT JOIN en_camiones ec ON ec.producto_id = p2.id
 WHERE p.id = p2.id
   AND p.activo = true;

-- Control: cuántos productos quedaron y con qué stock en el salón.
SELECT count(*) AS productos_activos,
       min(stock_actual) AS minimo_total,
       max(stock_actual) AS maximo_total
  FROM distribuidorajmerp.productos
 WHERE activo = true;

COMMIT;
