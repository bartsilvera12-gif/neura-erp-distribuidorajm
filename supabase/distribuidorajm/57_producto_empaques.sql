-- =============================================================================
-- 57 · CAJAS Y PAQUETES DE UN PRODUCTO (presentaciones)
-- =============================================================================
-- Un producto lleva su stock en unidades (la leche de a 1 L) y puede venderse
-- y comprarse también por caja: «Caja x12» con su precio y su código de barras.
-- Vender 1 caja descuenta 12 unidades; comprar 1 caja suma 12.
--
--  · producto_empaques: las presentaciones de cada producto.
--  · ventas_items.empaque_id / empaque_nombre / unidades: la línea dice
--    «1 Caja x12» en la factura, y `unidades` es lo que se descontó del stock
--    (para devolverlo bien si se anula la venta).
--
-- Solo toca `distribuidorajmerp`. Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS distribuidorajmerp.producto_empaques (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL,
  producto_id    uuid NOT NULL REFERENCES distribuidorajmerp.productos(id) ON DELETE CASCADE,
  nombre         text NOT NULL,
  factor         numeric NOT NULL CHECK (factor > 1),
  precio_venta   numeric CHECK (precio_venta IS NULL OR precio_venta >= 0),
  codigo_barras  text,
  activo         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_producto_empaques_producto
  ON distribuidorajmerp.producto_empaques (empresa_id, producto_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_producto_empaques_codigo
  ON distribuidorajmerp.producto_empaques (empresa_id, codigo_barras)
  WHERE activo AND codigo_barras IS NOT NULL AND codigo_barras <> '';

ALTER TABLE distribuidorajmerp.ventas_items
  ADD COLUMN IF NOT EXISTS empaque_id uuid,
  ADD COLUMN IF NOT EXISTS empaque_nombre text,
  ADD COLUMN IF NOT EXISTS unidades numeric;

DO $permisos$
DECLARE r record;
BEGIN
  ALTER TABLE distribuidorajmerp.producto_empaques ENABLE ROW LEVEL SECURITY;
  FOR r IN
    SELECT grantee, privilege_type FROM information_schema.role_table_grants
     WHERE table_schema = 'distribuidorajmerp' AND table_name = 'compras'
  LOOP
    EXECUTE format('GRANT %s ON distribuidorajmerp.producto_empaques TO %I', r.privilege_type, r.grantee);
  END LOOP;
END;
$permisos$;

SELECT pg_notify('pgrst', 'reload schema');

SELECT to_regclass('distribuidorajmerp.producto_empaques')::text AS tabla_creada,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'distribuidorajmerp' AND table_name = 'ventas_items'
           AND column_name IN ('empaque_id', 'empaque_nombre', 'unidades')) AS columnas_ventas_items;
