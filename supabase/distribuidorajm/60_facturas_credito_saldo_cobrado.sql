-- SQL 60 · Facturas de ventas a crédito: saldo y estado según lo cobrado
-- Solo schema distribuidorajmerp. Las ventas a crédito se cobran en Cobranzas
-- (con recibo), pero la factura no bajaba su saldo y seguía "Pendiente".
-- Esto la pone al día una vez; desde ahora el sistema lo hace solo al cobrar.
-- No toca facturas anuladas, corregidas con nota de crédito ni condonadas.
WITH nuevo AS (
  SELECT f.id,
         GREATEST(f.monto
           - COALESCE((SELECT sum(pg.monto) FROM distribuidorajmerp.pagos pg WHERE pg.factura_id = f.id), 0)
           - COALESCE((SELECT sum(m.monto) FROM distribuidorajmerp.caja_movimientos m
                        WHERE m.venta_id = v.id AND m.tipo = 'ingreso' AND m.anulado_at IS NULL), 0), 0) AS saldo
    FROM distribuidorajmerp.facturas f
    JOIN distribuidorajmerp.ventas v ON v.factura_id = f.id
   WHERE v.tipo_venta = 'CREDITO'
     AND COALESCE(v.estado, '') <> 'anulada'
     AND f.estado NOT IN ('Anulado', 'Corregida NC')
     AND (to_jsonb(f)->>'condonacion_tipo') IS NULL
)
UPDATE distribuidorajmerp.facturas f
   SET saldo = n.saldo,
       estado = CASE WHEN n.saldo <= 0.5 THEN 'Pagado'
                     WHEN f.estado = 'Pagado' THEN 'Pendiente'
                     ELSE f.estado END,
       updated_at = now()
  FROM nuevo n
 WHERE f.id = n.id
   AND (f.saldo IS DISTINCT FROM n.saldo OR (n.saldo <= 0.5) <> (f.estado = 'Pagado'));
