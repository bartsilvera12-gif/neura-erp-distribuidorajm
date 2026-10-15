-- 45 · Venta de la caja → factura electrónica (SIFEN)
--
-- Solo toca el schema distribuidorajmerp.
--
-- Cuando en la caja se cobra con "Factura" y SIFEN está activo, la venta genera
-- su factura (tabla facturas) y la manda a la SET. Esta columna guarda qué
-- factura le corresponde a cada venta: así la misma venta nunca se factura dos
-- veces y desde la venta se llega al KuDE.

BEGIN;

ALTER TABLE distribuidorajmerp.ventas
  ADD COLUMN IF NOT EXISTS factura_id uuid;

CREATE INDEX IF NOT EXISTS idx_ventas_factura_id
  ON distribuidorajmerp.ventas (factura_id)
  WHERE factura_id IS NOT NULL;

-- Las ventas por kilo llevan decimales (0,32 KG): la factura tiene que poder
-- guardarlos igual. En el esquema original ya es numeric; se asegura acá.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'distribuidorajmerp' AND table_name = 'factura_items'
                AND column_name = 'cantidad' AND data_type IN ('integer', 'bigint', 'smallint')) THEN
    ALTER TABLE distribuidorajmerp.factura_items ALTER COLUMN cantidad TYPE numeric;
    RAISE NOTICE 'factura_items.cantidad pasó a numeric (acepta decimales).';
  END IF;
END $$;

COMMIT;

-- Control
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'distribuidorajmerp'
   AND ((table_name = 'ventas' AND column_name = 'factura_id')
     OR (table_name = 'factura_items' AND column_name = 'cantidad'));
