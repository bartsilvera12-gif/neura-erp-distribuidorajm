-- =============================================================================
-- 56 · DEPÓSITOS DE CLIENTES (anticipos que se descuentan en la venta)
-- =============================================================================
-- El cliente deja plata a cuenta. Queda anotado como un recibo de dinero
-- (mismo correlativo REC-…) de tipo «deposito», sin tocar la caja, y es saldo
-- a favor del cliente. Al «Pasar a venta», la venta se paga primero con ese
-- saldo: solo la diferencia (si la hay) entra a la caja.
--
--  · recibos_cobro.tipo: 'cobro' (cobro de una venta a crédito) o 'deposito'.
--  · recibos_cobro.aplicado: cuánto del depósito ya se usó en ventas.
--  · recibos_cobro.anulado / referencia / observaciones.
--  · deposito_aplicaciones: qué venta usó cuánto de cada depósito (para
--    devolverlo si se anula la venta).
--
-- Requiere el SQL 53. Solo toca `distribuidorajmerp`. Idempotente.
-- =============================================================================

ALTER TABLE distribuidorajmerp.recibos_cobro
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'cobro',
  ADD COLUMN IF NOT EXISTS aplicado numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS anulado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referencia text,
  ADD COLUMN IF NOT EXISTS observaciones text;

DO $chk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'recibos_cobro_tipo_chk' AND conrelid = 'distribuidorajmerp.recibos_cobro'::regclass
  ) THEN
    ALTER TABLE distribuidorajmerp.recibos_cobro
      ADD CONSTRAINT recibos_cobro_tipo_chk CHECK (tipo IN ('cobro', 'deposito'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'recibos_cobro_aplicado_chk' AND conrelid = 'distribuidorajmerp.recibos_cobro'::regclass
  ) THEN
    ALTER TABLE distribuidorajmerp.recibos_cobro
      ADD CONSTRAINT recibos_cobro_aplicado_chk CHECK (aplicado >= 0 AND aplicado <= monto);
  END IF;
END;
$chk$;

CREATE TABLE IF NOT EXISTS distribuidorajmerp.deposito_aplicaciones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL,
  recibo_id   uuid NOT NULL REFERENCES distribuidorajmerp.recibos_cobro(id) ON DELETE RESTRICT,
  venta_id    uuid NOT NULL,
  monto       numeric NOT NULL CHECK (monto > 0),
  anulado     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deposito_aplicaciones_venta ON distribuidorajmerp.deposito_aplicaciones (empresa_id, venta_id);

DO $permisos$
DECLARE r record;
BEGIN
  ALTER TABLE distribuidorajmerp.deposito_aplicaciones ENABLE ROW LEVEL SECURITY;
  FOR r IN
    SELECT grantee, privilege_type FROM information_schema.role_table_grants
     WHERE table_schema = 'distribuidorajmerp' AND table_name = 'compras'
  LOOP
    EXECUTE format('GRANT %s ON distribuidorajmerp.deposito_aplicaciones TO %I', r.privilege_type, r.grantee);
  END LOOP;
END;
$permisos$;

SELECT pg_notify('pgrst', 'reload schema');

SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'distribuidorajmerp' AND table_name = 'recibos_cobro'
   AND column_name IN ('tipo', 'aplicado', 'anulado', 'referencia', 'observaciones')
 ORDER BY 1;
