-- =============================================================================
-- 00 · DIAGNÓSTICO (solo lectura) — confirmar el schema ORIGEN antes de clonar
-- =============================================================================
-- OPCIONAL. No modifica nada.
--
-- El origen es `instemaq` (el schema del ERP sistemas-propio), y así está
-- fijado en los scripts 01, 02 y 04. Este script sirve para confirmarlo antes
-- de correr el 01: `instemaq` tiene que aparecer con las tablas empresas,
-- usuarios, modulos, empresa_modulos y usuario_modulos, y varias decenas de
-- funciones.
-- =============================================================================

SELECT
  n.nspname                                           AS schema,
  count(*) FILTER (WHERE c.relkind = 'r')             AS tablas,
  count(*) FILTER (WHERE c.relkind = 'v')             AS vistas,
  count(*) FILTER (WHERE c.relkind = 'm')             AS matviews,
  bool_or(c.relname = 'empresas')                     AS tiene_empresas,
  bool_or(c.relname = 'usuarios')                     AS tiene_usuarios,
  bool_or(c.relname = 'modulos')                      AS tiene_modulos,
  bool_or(c.relname = 'empresa_modulos')              AS tiene_empresa_modulos
FROM pg_namespace n
LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relkind IN ('r','v','m')
WHERE n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
  AND n.nspname NOT LIKE 'pg_temp%'
  AND n.nspname NOT LIKE 'pg_toast%'
GROUP BY n.nspname
ORDER BY tiene_empresas DESC, tablas DESC;

-- Cantidad de funciones por schema (el origen debe tener varias decenas):
SELECT n.nspname AS schema, count(*) AS funciones
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema')
GROUP BY n.nspname
ORDER BY funciones DESC;
