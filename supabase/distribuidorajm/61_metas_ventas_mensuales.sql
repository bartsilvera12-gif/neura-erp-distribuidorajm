-- SQL 61 · Metas de ventas mensuales (en guaraníes)
-- Solo schema distribuidorajmerp. Una meta por mes y por ámbito:
--   clave = 'total'          → meta de toda la empresa
--   clave = <id de usuario>  → meta de esa persona (camionero, salón)
-- Se pueden cargar meses futuros (por ejemplo, el mes siguiente).
CREATE TABLE IF NOT EXISTS distribuidorajmerp.metas_ventas_mensuales (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL,
  mes         char(7) NOT NULL CHECK (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  clave       text NOT NULL,
  monto       numeric NOT NULL CHECK (monto > 0),
  nota        text,
  creado_por  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, mes, clave)
);
CREATE INDEX IF NOT EXISTS idx_metas_ventas_empresa_mes
  ON distribuidorajmerp.metas_ventas_mensuales (empresa_id, mes);
