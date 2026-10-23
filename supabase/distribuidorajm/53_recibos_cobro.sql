-- =============================================================================
-- 53 · RECIBOS DE DINERO
-- =============================================================================
-- Punto 3 de la solicitud del 23/10/2026.
--
-- Cada cobro a un cliente emite un recibo de dinero con número correlativo
-- (por empresa) que queda registrado: se lista y se reimprime desde
-- Cobranzas → Recibos. El cobro en sí sigue siendo el ingreso de caja
-- (caja_movimientos); el recibo lo referencia.
--
-- Al final carga los recibos de los cobros que ya se hicieron, en orden de
-- fecha, para que el control arranque completo.
--
-- La tabla se llama `recibos_cobro` y no `recibos_dinero`: en esta base ya
-- existe una `recibos_dinero` (vino con el schema de origen) con otras
-- columnas, y no se la toca.
--
-- Solo toca `distribuidorajmerp`. Idempotente.
-- =============================================================================

-- Si ya hay una tabla con este nombre que no es la nuestra, se para acá con
-- un mensaje claro en vez de fallar a mitad de camino.
DO $guard$
BEGIN
  IF to_regclass('distribuidorajmerp.recibos_cobro') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'distribuidorajmerp' AND table_name = 'recibos_cobro' AND column_name = 'caja_movimiento_id'
  ) THEN
    RAISE EXCEPTION 'Ya existe distribuidorajmerp.recibos_cobro con otras columnas: avisá antes de seguir (no se tocó nada).';
  END IF;
END;
$guard$;

CREATE TABLE IF NOT EXISTS distribuidorajmerp.recibos_cobro (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL,
  numero             integer NOT NULL,
  fecha              timestamptz NOT NULL DEFAULT now(),
  cliente_id         uuid,
  cliente_nombre     text NOT NULL,
  cliente_ruc        text,
  monto              numeric NOT NULL CHECK (monto > 0),
  medio_pago         text,
  concepto           text,
  venta_id           uuid,
  venta_numero       text,
  saldo_restante     numeric,
  caja_movimiento_id uuid,
  usuario_nombre     text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, numero)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_recibos_cobro_movimiento
  ON distribuidorajmerp.recibos_cobro (caja_movimiento_id) WHERE caja_movimiento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recibos_cobro_fecha ON distribuidorajmerp.recibos_cobro (empresa_id, fecha DESC);

-- Mismos permisos que una tabla que el ERP ya usa (la API entra por el pool).
DO $permisos$
DECLARE r record;
BEGIN
  ALTER TABLE distribuidorajmerp.recibos_cobro ENABLE ROW LEVEL SECURITY;
  FOR r IN
    SELECT grantee, privilege_type FROM information_schema.role_table_grants
     WHERE table_schema = 'distribuidorajmerp' AND table_name = 'compras'
  LOOP
    EXECUTE format('GRANT %s ON distribuidorajmerp.recibos_cobro TO %I', r.privilege_type, r.grantee);
  END LOOP;
END;
$permisos$;

-- Recibos de los cobros anteriores (ventas a crédito ya cobradas), numerados
-- por fecha a continuación del último que haya.
INSERT INTO distribuidorajmerp.recibos_cobro
  (empresa_id, numero, fecha, cliente_id, cliente_nombre, cliente_ruc, monto, medio_pago,
   concepto, venta_id, venta_numero, caja_movimiento_id, created_at)
SELECT m.empresa_id,
       COALESCE((SELECT max(r.numero) FROM distribuidorajmerp.recibos_cobro r WHERE r.empresa_id = m.empresa_id), 0)
         + row_number() OVER (PARTITION BY m.empresa_id ORDER BY m.created_at, m.id),
       m.created_at,
       v.cliente_id,
       COALESCE(NULLIF(btrim(to_jsonb(c) ->> 'razon_social'), ''), NULLIF(btrim(to_jsonb(c) ->> 'nombre'), ''),
                NULLIF(btrim(to_jsonb(c) ->> 'empresa'), ''), 'Sin nombre'),
       COALESCE(NULLIF(btrim(to_jsonb(c) ->> 'ruc'), ''), NULLIF(btrim(to_jsonb(c) ->> 'documento'), ''),
                NULLIF(btrim(to_jsonb(c) ->> 'ci'), '')),
       m.monto,
       m.medio_pago,
       'Pago de la venta a crédito N° ' || v.numero_control,
       v.id,
       v.numero_control,
       m.id,
       m.created_at
  FROM distribuidorajmerp.caja_movimientos m
  JOIN distribuidorajmerp.ventas v ON v.id = m.venta_id
  LEFT JOIN distribuidorajmerp.clientes c ON c.id = v.cliente_id
 WHERE m.tipo = 'ingreso'
   AND v.tipo_venta = 'CREDITO'
   AND m.monto > 0
   AND NOT EXISTS (SELECT 1 FROM distribuidorajmerp.recibos_cobro r WHERE r.caja_movimiento_id = m.id);

SELECT pg_notify('pgrst', 'reload schema');

SELECT count(*) AS recibos_registrados FROM distribuidorajmerp.recibos_cobro;
