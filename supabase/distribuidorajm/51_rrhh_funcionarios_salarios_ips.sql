-- =============================================================================
-- 51 · RRHH: FUNCIONARIOS, PAGOS DE SALARIOS Y PAGOS DE IPS
-- =============================================================================
-- Puntos 4 y 12 de la solicitud del 23/10/2026.
--
--  · funcionarios: el personal de la empresa (no hace falta que tenga usuario
--    del sistema: un chofer o un ayudante también cobra salario y aporta IPS).
--  · rrhh_pagos_salario: un pago por funcionario y período (mes), pendiente o
--    pagado, con fecha de pago e importe.
--  · rrhh_pagos_ips: el aporte de IPS por funcionario y mes, con vencimiento,
--    fecha de pago, importe (aporte obrero 9% + patronal 16,5%) y estado.
--
-- Un funcionario no puede tener dos pagos del mismo tipo en el mismo mes
-- (evita duplicados). Solo toca `distribuidorajmerp`. Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS distribuidorajmerp.funcionarios (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL,
  nombre         text NOT NULL,
  apellido       text,
  ci             text,
  cargo          text,
  telefono       text,
  fecha_ingreso  date,
  salario_base   numeric NOT NULL DEFAULT 0 CHECK (salario_base >= 0),
  aporta_ips     boolean NOT NULL DEFAULT true,
  estado         text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  usuario_id     uuid,
  observaciones  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_funcionarios_empresa ON distribuidorajmerp.funcionarios (empresa_id, estado);
CREATE UNIQUE INDEX IF NOT EXISTS uq_funcionarios_ci
  ON distribuidorajmerp.funcionarios (empresa_id, ci) WHERE ci IS NOT NULL AND ci <> '';

CREATE TABLE IF NOT EXISTS distribuidorajmerp.rrhh_pagos_salario (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL,
  funcionario_id     uuid NOT NULL REFERENCES distribuidorajmerp.funcionarios(id) ON DELETE RESTRICT,
  funcionario_nombre text NOT NULL,
  periodo            text NOT NULL CHECK (periodo ~ '^[0-9]{4}-[0-9]{2}$'),
  monto              numeric NOT NULL DEFAULT 0 CHECK (monto >= 0),
  fecha_pago         date,
  estado             text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagado')),
  observaciones      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, funcionario_id, periodo)
);
CREATE INDEX IF NOT EXISTS idx_pagos_salario_periodo ON distribuidorajmerp.rrhh_pagos_salario (empresa_id, periodo);

CREATE TABLE IF NOT EXISTS distribuidorajmerp.rrhh_pagos_ips (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL,
  funcionario_id     uuid NOT NULL REFERENCES distribuidorajmerp.funcionarios(id) ON DELETE RESTRICT,
  funcionario_nombre text NOT NULL,
  periodo            text NOT NULL CHECK (periodo ~ '^[0-9]{4}-[0-9]{2}$'),
  salario_imponible  numeric NOT NULL DEFAULT 0 CHECK (salario_imponible >= 0),
  aporte_obrero      numeric NOT NULL DEFAULT 0 CHECK (aporte_obrero >= 0),
  aporte_patronal    numeric NOT NULL DEFAULT 0 CHECK (aporte_patronal >= 0),
  monto              numeric NOT NULL DEFAULT 0 CHECK (monto >= 0),
  fecha_vencimiento  date,
  fecha_pago         date,
  estado             text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagado')),
  observaciones      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, funcionario_id, periodo)
);
CREATE INDEX IF NOT EXISTS idx_pagos_ips_periodo ON distribuidorajmerp.rrhh_pagos_ips (empresa_id, periodo);

-- Mismos permisos que una tabla que el ERP ya usa (la API entra por el pool).
DO $permisos$
DECLARE r record; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['funcionarios', 'rrhh_pagos_salario', 'rrhh_pagos_ips'] LOOP
    EXECUTE format('ALTER TABLE distribuidorajmerp.%I ENABLE ROW LEVEL SECURITY', t);
    FOR r IN
      SELECT grantee, privilege_type FROM information_schema.role_table_grants
       WHERE table_schema = 'distribuidorajmerp' AND table_name = 'compras'
    LOOP
      EXECUTE format('GRANT %s ON distribuidorajmerp.%I TO %I', r.privilege_type, t, r.grantee);
    END LOOP;
  END LOOP;
  PERFORM pg_notify('pgrst', 'reload schema');
END;
$permisos$;

SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'distribuidorajmerp'
   AND table_name IN ('funcionarios', 'rrhh_pagos_salario', 'rrhh_pagos_ips')
 ORDER BY 1;
