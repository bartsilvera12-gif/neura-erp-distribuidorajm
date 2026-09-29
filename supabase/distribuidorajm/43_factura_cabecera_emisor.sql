-- 43 · Cabecera de la factura A4: actividad económica, departamento, ciudad y email del emisor.
--
-- Solo toca el schema distribuidorajmerp.
--
-- La factura se imprime ahora con el formato de la SET (como las de los
-- proveedores) y la cabecera lleva datos que la configuración no guardaba.
-- Además se cargan los datos de Distribuidora JM tal como figuran en su factura
-- 001-001-0010232. Solo se completan los campos VACÍOS: lo que ya esté cargado
-- en Configuración → Facturación no se pisa.
--
-- El timbrado NO se carga acá: se completa en Configuración → Facturación.

BEGIN;

ALTER TABLE distribuidorajmerp.empresa_autoimpresor_config
  ADD COLUMN IF NOT EXISTS actividad_economica text,
  ADD COLUMN IF NOT EXISTS departamento        text,
  ADD COLUMN IF NOT EXISTS ciudad              text,
  ADD COLUMN IF NOT EXISTS email               text;

DO $$
DECLARE
  emp uuid := '058efef5-e1b5-4cab-8a65-238f81823917';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM distribuidorajmerp.empresas WHERE id = emp) THEN
    RAISE EXCEPTION 'No encontré la empresa %. No se cargó nada.', emp;
  END IF;

  INSERT INTO distribuidorajmerp.empresa_autoimpresor_config AS c
    (empresa_id, ruc_emisor, razon_social_emisor, actividad_economica,
     direccion_matriz, departamento, ciudad, telefono, email)
  VALUES
    (emp, '80156353-4', 'DISTRIBUIDORA JM ACOSTA S.A.',
     'COMERCIO AL POR MAYOR DE CARNE, MENUDENCIAS Y',
     'RUTA PY A 027 ESQ. MANUEL GAMARRA', 'CENTRAL', 'ITA',
     '0981 279571', 'distribuidorajmacosta@gmail.com')
  ON CONFLICT (empresa_id) DO UPDATE SET
    ruc_emisor          = COALESCE(NULLIF(btrim(c.ruc_emisor), ''),          EXCLUDED.ruc_emisor),
    razon_social_emisor = COALESCE(NULLIF(btrim(c.razon_social_emisor), ''), EXCLUDED.razon_social_emisor),
    actividad_economica = COALESCE(NULLIF(btrim(c.actividad_economica), ''), EXCLUDED.actividad_economica),
    direccion_matriz    = COALESCE(NULLIF(btrim(c.direccion_matriz), ''),    EXCLUDED.direccion_matriz),
    departamento        = COALESCE(NULLIF(btrim(c.departamento), ''),        EXCLUDED.departamento),
    ciudad              = COALESCE(NULLIF(btrim(c.ciudad), ''),              EXCLUDED.ciudad),
    telefono            = COALESCE(NULLIF(btrim(c.telefono), ''),            EXCLUDED.telefono),
    email               = COALESCE(NULLIF(btrim(c.email), ''),               EXCLUDED.email),
    updated_at          = now();
END $$;

-- Control: cómo quedó la cabecera.
SELECT ruc_emisor, razon_social_emisor, actividad_economica, direccion_matriz,
       departamento, ciudad, telefono, email, timbrado_numero, activo
  FROM distribuidorajmerp.empresa_autoimpresor_config
 WHERE empresa_id = '058efef5-e1b5-4cab-8a65-238f81823917';

COMMIT;
