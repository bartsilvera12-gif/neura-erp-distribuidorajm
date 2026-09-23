-- =============================================================================
-- 23 · Cargar cuotas atrasadas (facturas Vencidas) por socio moroso
-- =============================================================================
-- Fuente: Excel ASOCIACION HERNANDARIAS AZULGRANA - hoja TESORERIA
-- Se genera una factura Vencida por cada mes impago entre fecha de ingreso
-- del socio y septiembre 2026. Monto por mes = el pago tipico de ese mes
-- (30.000 en nov/dic 2025, 25.000 de 2026 en adelante).
--
-- Idempotente: usa numero_factura unico CUOTA-<socio>-<YYYYMM>, y salta si
-- ya existe. Rollback friendly (BEGIN/COMMIT).
-- =============================================================================

BEGIN;

-- Empresa unica del tenant
DO $$
DECLARE
  v_empresa_id uuid;
  v_cliente_id uuid;
  v_numero_factura text;
BEGIN
  SELECT id INTO v_empresa_id FROM asociacionazulgranaerp.empresas LIMIT 1;
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No hay empresa en el tenant';
  END IF;

  -- Socio #  2 ANDRES ROA FARIÑA — 9 meses. Gs. 225.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 2;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-2-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-2-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-2-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-2-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-2-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-2-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-2-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-2-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-2-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #2 (ANDRES ROA FARIÑA) no encontrado en clientes — se omite';
  END IF;

  -- Socio #  3 DOMINGO DAMIAN GONZALEZ BENTIEZ — 5 meses. Gs. 125.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 3;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-3-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-3-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-3-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-3-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-3-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #3 (DOMINGO DAMIAN GONZALEZ BENTIEZ) no encontrado en clientes — se omite';
  END IF;

  -- Socio #  5 JOSE HORACIO LOPEZ NUARTE — 3 meses. Gs. 75.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 5;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-5-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-5-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-5-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #5 (JOSE HORACIO LOPEZ NUARTE) no encontrado en clientes — se omite';
  END IF;

  -- Socio #  7 REINERIO RODRIGO AGÜERO BENITEZ — 3 meses. Gs. 75.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 7;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-7-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-7-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-7-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #7 (REINERIO RODRIGO AGÜERO BENITEZ) no encontrado en clientes — se omite';
  END IF;

  -- Socio #  9 JAVIER WALDEMAR ROTELA ROCHEMBACH — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 9;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-9-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-9-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-9-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-9-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-9-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-9-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-9-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-9-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-9-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-9-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #9 (JAVIER WALDEMAR ROTELA ROCHEMBACH) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 11 ELVIS GABRIEL MARCIANO CAÑIZA ARZAMENDIA — 8 meses. Gs. 200.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 11;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-11-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-11-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-11-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-11-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-11-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-11-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-11-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-11-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #11 (ELVIS GABRIEL MARCIANO CAÑIZA ARZAMENDIA) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 13 PABLO CESAR FERNANDEZ DUARTE — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 13;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-13-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-13-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-13-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-13-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-13-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-13-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-13-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-13-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-13-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-13-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #13 (PABLO CESAR FERNANDEZ DUARTE) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 14 DERLIS GABRIEL TORALES PANIAGUA — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 14;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-14-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-14-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-14-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-14-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-14-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-14-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-14-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-14-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-14-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-14-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #14 (DERLIS GABRIEL TORALES PANIAGUA) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 15 FREDDY RICARDO MORAL DUARTE — 4 meses. Gs. 105.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 15;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-15-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-15-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-15-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-15-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #15 (FREDDY RICARDO MORAL DUARTE) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 16 ISAAC ROA FARIÑA — 3 meses. Gs. 75.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 16;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-16-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-16-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-16-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #16 (ISAAC ROA FARIÑA) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 17 JUAN MARCELO ARCE LOPEZ — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 17;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-17-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-17-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-17-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-17-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-17-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-17-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-17-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-17-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-17-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-17-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #17 (JUAN MARCELO ARCE LOPEZ) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 18 PEDRO ALCIDES ROLON ALONZO — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 18;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-18-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-18-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-18-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-18-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-18-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-18-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-18-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-18-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-18-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-18-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #18 (PEDRO ALCIDES ROLON ALONZO) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 20 WILSON MEDINA GAVILAN — 7 meses. Gs. 175.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 20;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-20-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-20-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-20-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-20-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-20-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-20-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-20-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #20 (WILSON MEDINA GAVILAN) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 21 MILCIADES SOSA MARTINEZ — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 21;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-21-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-21-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-21-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-21-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-21-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-21-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-21-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-21-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-21-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-21-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #21 (MILCIADES SOSA MARTINEZ) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 22 JORGE MERCEDES PEREZ CABRAL — 9 meses. Gs. 225.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 22;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-22-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-22-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-22-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-22-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-22-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-22-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-22-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-22-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-22-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #22 (JORGE MERCEDES PEREZ CABRAL) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 23 RAFAEL ANDERSON WIRSCHKE MONGES — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 23;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-23-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-23-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-23-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-23-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-23-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-23-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-23-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-23-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-23-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-23-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #23 (RAFAEL ANDERSON WIRSCHKE MONGES) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 29 RUBEN EDUARDO FRANCO MARTINEZ — 5 meses. Gs. 125.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 29;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-29-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-29-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-29-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-29-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-29-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #29 (RUBEN EDUARDO FRANCO MARTINEZ) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 30 FERNANDO JAVIER CUMBAI BOGARIN — 2 meses. Gs. 50.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 30;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-30-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-30-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #30 (FERNANDO JAVIER CUMBAI BOGARIN) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 31 RONALD ADOLFO HOBECKER GOMEZ — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 31;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-31-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-31-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-31-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-31-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-31-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-31-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-31-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-31-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-31-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-31-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #31 (RONALD ADOLFO HOBECKER GOMEZ) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 32 VICTOR DANIEL FRANCO VERON — 1 meses. Gs. 25.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 32;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-32-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #32 (VICTOR DANIEL FRANCO VERON) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 33 WILMAR LORENZO TORALES PANIAGUA — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 33;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-33-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-33-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-33-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-33-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-33-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-33-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-33-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-33-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-33-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-33-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #33 (WILMAR LORENZO TORALES PANIAGUA) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 34 CESAR DAVID PALMA CHAMORRO — 9 meses. Gs. 225.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 34;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-34-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-34-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-34-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-34-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-34-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-34-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-34-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-34-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-34-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #34 (CESAR DAVID PALMA CHAMORRO) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 35 OMAR ARIEL BURGOS PASTER — 9 meses. Gs. 225.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 35;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-35-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-35-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-35-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-35-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-35-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-35-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-35-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-35-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-35-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #35 (OMAR ARIEL BURGOS PASTER) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 36 JESUS MANUEL ARGUELLO ALARCON — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 36;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-36-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-36-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-36-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-36-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-36-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-36-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-36-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-36-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-36-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-36-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #36 (JESUS MANUEL ARGUELLO ALARCON) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 38 FERNANDO EFIGENIO CACERES SERVIAN — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 38;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-38-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-38-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-38-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-38-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-38-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-38-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-38-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-38-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-38-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-38-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #38 (FERNANDO EFIGENIO CACERES SERVIAN) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 39 DIEGO DANIEL ROTELA ROCHEMBACH — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 39;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-39-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-39-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-39-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-39-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-39-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-39-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-39-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-39-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-39-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-39-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #39 (DIEGO DANIEL ROTELA ROCHEMBACH) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 41 ROLANDO JAVIER CACERES SANABRIA — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 41;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-41-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-41-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-41-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-41-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-41-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-41-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-41-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-41-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-41-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-41-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #41 (ROLANDO JAVIER CACERES SANABRIA) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 42 VICTOR ANTONIO VELAZQUEZ — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 42;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-42-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-42-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-42-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-42-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-42-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-42-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-42-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-42-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-42-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-42-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #42 (VICTOR ANTONIO VELAZQUEZ) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 43 JOSE MARIA ROLON LOPEZ — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 43;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-43-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-43-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-43-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-43-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-43-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-43-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-43-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-43-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-43-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-43-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #43 (JOSE MARIA ROLON LOPEZ) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 44 PEDRO GUZMAN ROTELA ROCHEMBACH — 3 meses. Gs. 75.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 44;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-44-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-44-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-44-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #44 (PEDRO GUZMAN ROTELA ROCHEMBACH) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 45 LAURA ANTONELA FRANCO MARTINEZ — 3 meses. Gs. 75.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 45;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-45-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-45-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-45-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #45 (LAURA ANTONELA FRANCO MARTINEZ) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 46 FERNANDO FRANCO ARZAMENDIA — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 46;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-46-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-46-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-46-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-46-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-46-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-46-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-46-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-46-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-46-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-46-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #46 (FERNANDO FRANCO ARZAMENDIA) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 47 JONATHAN CESAR FRANCO ARZAMENDIA — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 47;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-47-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-47-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-47-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-47-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-47-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-47-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-47-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-47-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-47-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-47-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #47 (JONATHAN CESAR FRANCO ARZAMENDIA) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 48 DENIS IRAN ORTIZ DE OLIVEIRA — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 48;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-48-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-48-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-48-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-48-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-48-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-48-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-48-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-48-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-48-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-48-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #48 (DENIS IRAN ORTIZ DE OLIVEIRA) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 49 RAMON DARIO ACOSTA GARCETE — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 49;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-49-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-49-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-49-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-49-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-49-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-49-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-49-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-49-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-49-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-49-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #49 (RAMON DARIO ACOSTA GARCETE) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 50 ALFREDO RAMON LOMAQUIZ ESCALANTE — 6 meses. Gs. 150.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 50;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-50-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-50-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-50-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-50-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-50-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-50-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #50 (ALFREDO RAMON LOMAQUIZ ESCALANTE) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 51 OVIDIO RAMON ANTONIO REYES ASCONA — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 51;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-51-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-51-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-51-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-51-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-51-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-51-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-51-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-51-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-51-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-51-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #51 (OVIDIO RAMON ANTONIO REYES ASCONA) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 53 JUAN LORENZO VELOTTO GONZALEZ — 3 meses. Gs. 75.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 53;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-53-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-53-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-53-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #53 (JUAN LORENZO VELOTTO GONZALEZ) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 54 RICHARD SEBASTIAN CHAMORRO — 9 meses. Gs. 225.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 54;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-54-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-54-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-54-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-54-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-54-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-54-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-54-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-54-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-54-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #54 (RICHARD SEBASTIAN CHAMORRO) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 56 DENIS MARCELO VILLALBA LEGUIZAMÓN — 4 meses. Gs. 105.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 56;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-56-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-56-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-56-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-56-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #56 (DENIS MARCELO VILLALBA LEGUIZAMÓN) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 57 RONALD ARSENIO PENAYO ULDERA — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 57;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-57-202511';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-11-01', DATE '2025-11-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-57-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-57-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-57-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-57-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-57-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-57-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-57-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-57-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-57-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #57 (RONALD ARSENIO PENAYO ULDERA) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 58 CRISTHIAN GONZÁLEZ CARDOZO — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 58;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-58-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-58-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-58-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-58-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-58-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-58-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-58-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-58-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-58-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-58-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #58 (CRISTHIAN GONZÁLEZ CARDOZO) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 59 HUGO FRANCISCO CENTURION ESQUIVEL — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 59;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-59-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-59-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-59-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-59-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-59-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-59-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-59-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-59-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-59-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-59-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #59 (HUGO FRANCISCO CENTURION ESQUIVEL) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 60 JUAN ANGEL GOMEZ ORREGO — 1 meses. Gs. 30.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 60;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-60-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #60 (JUAN ANGEL GOMEZ ORREGO) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 61 DERLIS ARMANDO SAMUDIO VALDEZ — 10 meses. Gs. 255.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 61;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-61-202512';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2025-12-01', DATE '2025-12-10', 30000, 30000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-61-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-61-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-61-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-61-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-61-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-61-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-61-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-61-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-61-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #61 (DERLIS ARMANDO SAMUDIO VALDEZ) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 62 RAUL ANTONIO WEIMBERG ESCURRA — 3 meses. Gs. 75.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 62;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-62-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-62-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-62-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #62 (RAUL ANTONIO WEIMBERG ESCURRA) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 63 CARLOS DAVID BALMACEDA LAGRAVE — 9 meses. Gs. 225.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 63;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-63-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-63-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-63-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-63-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-63-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-63-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-63-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-63-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-63-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #63 (CARLOS DAVID BALMACEDA LAGRAVE) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 65 JAVIER CRIPIN VILLALBA LEGUIZAMON — 9 meses. Gs. 225.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 65;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-65-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-65-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-65-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-65-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-65-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-65-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-65-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-65-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-65-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #65 (JAVIER CRIPIN VILLALBA LEGUIZAMON) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 66 BERNARDO BRITEZ PAREDES — 9 meses. Gs. 225.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 66;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-66-202601';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-01-01', DATE '2026-01-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-66-202602';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-02-01', DATE '2026-02-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-66-202603';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-03-01', DATE '2026-03-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-66-202604';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-04-01', DATE '2026-04-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-66-202605';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-05-01', DATE '2026-05-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-66-202606';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-06-01', DATE '2026-06-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-66-202607';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-07-01', DATE '2026-07-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-66-202608';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-08-01', DATE '2026-08-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
    v_numero_factura := 'CUOTA-66-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #66 (BERNARDO BRITEZ PAREDES) no encontrado en clientes — se omite';
  END IF;

  -- Socio # 73 JUAN MANUEL AZUAGA — 1 meses. Gs. 25.000
  SELECT id INTO v_cliente_id FROM asociacionazulgranaerp.clientes
   WHERE empresa_id = v_empresa_id AND numero_socio = 73;
  IF v_cliente_id IS NOT NULL THEN
    v_numero_factura := 'CUOTA-73-202609';
    IF NOT EXISTS (SELECT 1 FROM asociacionazulgranaerp.facturas WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura) THEN
      INSERT INTO asociacionazulgranaerp.facturas
        (empresa_id, cliente_id, numero_factura, fecha, fecha_vencimiento, monto, saldo, estado, tipo, moneda)
      VALUES
        (v_empresa_id, v_cliente_id, v_numero_factura, DATE '2026-09-01', DATE '2026-09-10', 25000, 25000, 'Vencido', 'credito', 'GS');
    END IF;
  ELSE
    RAISE NOTICE 'Socio #73 (JUAN MANUEL AZUAGA) no encontrado en clientes — se omite';
  END IF;

END $$;

-- Verificacion
SELECT
  count(*) FILTER (WHERE numero_factura LIKE 'CUOTA-%' AND estado = 'Vencido') AS cuotas_atrasadas_creadas,
  sum(saldo) FILTER (WHERE numero_factura LIKE 'CUOTA-%' AND estado = 'Vencido') AS deuda_total_gs
FROM asociacionazulgranaerp.facturas;

COMMIT;
-- Si algo no cuadra:
-- ROLLBACK;
