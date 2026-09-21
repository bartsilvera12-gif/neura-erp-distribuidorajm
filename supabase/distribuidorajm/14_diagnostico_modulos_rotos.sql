-- ============================================================================
-- 14. Diagnóstico: por qué fallan Gerencia, Agenda y Auditoría de facturas
-- ============================================================================
--
-- SOLO LEE. No crea, no modifica, no borra nada. Se puede correr las veces que
-- haga falta.
--
-- Los tres módulos están en la lista de los 18 que se pidieron (ver el 03), así
-- que no es que "no correspondan": están habilitados y fallan. Este script dice
-- exactamente qué objeto le falta a cada uno, para no arreglar a ciegas.
--
-- El 01 clonó estructura —tablas, vistas, índices— desde el schema de origen.
-- Lo que ese origen no tenía, acá tampoco está. Y las vistas que sí se
-- clonaron pueden existir pero leer columnas que este negocio no usa.
--
-- Cómo leerlo: cada fila dice el módulo, qué necesita, de qué tipo y si está.
-- Las que digan FALTA son las que hay que crear.
-- ============================================================================

\set ON_ERROR_STOP on

WITH necesita(modulo, objeto, tipo, para_que) AS (
  VALUES
    -- Gerencia (src/lib/gerencia/comercial-data.ts)
    ('Gerencia',  'clientes',                'tabla', 'Nombre del cliente en el top de facturación'),
    ('Gerencia',  'facturas',                'tabla', 'Facturado del mes y comparación con el mes pasado'),
    ('Gerencia',  'v_revenue_mensual',       'vista', 'Serie de facturado / cobrado / pendiente por mes'),
    ('Gerencia',  'v_cuentas_por_cobrar',    'vista', 'Saldo total por cobrar'),
    ('Gerencia',  'v_mrr',                   'vista', 'Ingreso recurrente y suscripciones activas'),
    ('Gerencia',  'v_revenue_por_categoria', 'vista', 'Facturado por categoría'),
    ('Gerencia',  'v_clientes_recurrentes',  'vista', 'Recurrencia y clientes sin facturar'),
    -- Agenda (src/app/api/agenda)
    ('Agenda',    'agenda_citas',             'tabla', 'Las citas'),
    ('Agenda',    'agenda_cita_responsables', 'tabla', 'Quién más participa de cada cita'),
    -- Auditoría de facturas
    ('Auditoría', 'facturas',                 'tabla', 'Los comprobantes auditados')
)
SELECT
  n.modulo,
  n.objeto,
  n.tipo,
  CASE
    WHEN to_regclass('distribuidorajmerp.' || n.objeto) IS NULL THEN 'FALTA'
    ELSE 'ok'
  END AS estado,
  n.para_que
FROM necesita n
ORDER BY (to_regclass('distribuidorajmerp.' || n.objeto) IS NOT NULL), n.modulo, n.objeto;

-- ── Columnas sueltas que rompen pantallas enteras ──────────────────────────
-- `razon_social` corta la auditoría de facturas y salía también en el alta de
-- cliente; `es_qa` y compañía dejaban vacío el selector de vendedor.
WITH necesita(tabla, columna, para_que) AS (
  VALUES
    ('clientes', 'razon_social',        'Auditoría de facturas y razón social del cliente'),
    ('clientes', 'ruc_factura',         'RUC con el que se factura, si difiere del RUC'),
    ('usuarios', 'es_qa',               'Selector de vendedor responsable'),
    ('usuarios', 'es_project_manager',  'Selector de vendedor responsable'),
    ('usuarios', 'es_tecnico',          'Selector de vendedor responsable')
)
SELECT
  n.tabla,
  n.columna,
  CASE WHEN c.column_name IS NULL THEN 'FALTA' ELSE 'ok' END AS estado,
  n.para_que
FROM necesita n
LEFT JOIN information_schema.columns c
       ON c.table_schema = 'distribuidorajmerp'
      AND c.table_name   = n.tabla
      AND c.column_name  = n.columna
ORDER BY (c.column_name IS NOT NULL), n.tabla, n.columna;

-- ── Si `facturas` existe, cuánto hay adentro ───────────────────────────────
-- Gerencia puede estar tirando 500 por una vista que falta, pero también puede
-- ser que esté todo y no haya una sola factura: son dos problemas distintos y
-- conviene no confundirlos.
DO $$
DECLARE v_n bigint;
BEGIN
  IF to_regclass('distribuidorajmerp.facturas') IS NULL THEN
    RAISE NOTICE 'facturas: la tabla no existe.';
  ELSE
    EXECUTE 'SELECT count(*) FROM distribuidorajmerp.facturas' INTO v_n;
    RAISE NOTICE 'facturas: % filas.', v_n;
  END IF;

  IF to_regclass('distribuidorajmerp.ventas') IS NULL THEN
    RAISE NOTICE 'ventas: la tabla no existe.';
  ELSE
    EXECUTE 'SELECT count(*) FROM distribuidorajmerp.ventas' INTO v_n;
    RAISE NOTICE 'ventas: % filas.', v_n;
  END IF;
END;
$$;
