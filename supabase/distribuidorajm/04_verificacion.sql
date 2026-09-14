-- =============================================================================
-- 04 · VERIFICACIÓN (solo lectura)
-- =============================================================================
-- 1) Comparación estructural origen vs destino (deben coincidir tabla/vista/func)
-- 2) Fugas: cualquier referencia residual al schema origen desde el nuevo
-- 3) Conteo de filas (todas las tablas de negocio deben estar en 0)
-- Origen: instemaq · Destino: distribuidorajmerp
-- =============================================================================

-- 1) Conteos por tipo de objeto -------------------------------------------------
SELECT 'objetos' AS chequeo, kind, origen, destino, (origen = destino) AS ok
FROM (
  SELECT CASE c.relkind WHEN 'r' THEN 'tablas' WHEN 'v' THEN 'vistas'
                        WHEN 'm' THEN 'matviews' WHEN 'S' THEN 'secuencias'
                        WHEN 'i' THEN 'indices' END AS kind,
         count(*) FILTER (WHERE n.nspname = 'instemaq')         AS origen,
         count(*) FILTER (WHERE n.nspname = 'distribuidorajmerp') AS destino
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('instemaq','distribuidorajmerp') AND c.relkind IN ('r','v','m','S','i')
  GROUP BY 1
) t
UNION ALL
SELECT 'objetos', 'funciones',
       count(*) FILTER (WHERE n.nspname = 'instemaq'),
       count(*) FILTER (WHERE n.nspname = 'distribuidorajmerp'),
       count(*) FILTER (WHERE n.nspname = 'instemaq') = count(*) FILTER (WHERE n.nspname = 'distribuidorajmerp')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('instemaq','distribuidorajmerp')
UNION ALL
SELECT 'objetos', 'policies',
       count(*) FILTER (WHERE n.nspname = 'instemaq'),
       count(*) FILTER (WHERE n.nspname = 'distribuidorajmerp'),
       count(*) FILTER (WHERE n.nspname = 'instemaq') = count(*) FILTER (WHERE n.nspname = 'distribuidorajmerp')
FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('instemaq','distribuidorajmerp')
UNION ALL
SELECT 'objetos', 'triggers',
       count(*) FILTER (WHERE n.nspname = 'instemaq'),
       count(*) FILTER (WHERE n.nspname = 'distribuidorajmerp'),
       count(*) FILTER (WHERE n.nspname = 'instemaq') = count(*) FILTER (WHERE n.nspname = 'distribuidorajmerp')
FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('instemaq','distribuidorajmerp') AND NOT tg.tgisinternal
UNION ALL
SELECT 'objetos', 'constraints',
       count(*) FILTER (WHERE n.nspname = 'instemaq'),
       count(*) FILTER (WHERE n.nspname = 'distribuidorajmerp'),
       count(*) FILTER (WHERE n.nspname = 'instemaq') = count(*) FILTER (WHERE n.nspname = 'distribuidorajmerp')
FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('instemaq','distribuidorajmerp');

-- 2) FUGAS: el schema nuevo NO debe depender de ningún otro schema del ERP -----
-- (0 filas = independencia total)
-- FKs hacia CUALQUIER schema ajeno (no solo el origen). `auth` se excluye:
-- auth.users es de Supabase y se comparte por diseño.
SELECT 'fuga_fk' AS tipo, c.relname::text AS objeto,
       co.conname::text || ' -> ' || rn.nspname::text || '.' || rf.relname::text AS detalle
FROM pg_constraint co
JOIN pg_class c ON c.oid = co.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_class rf ON rf.oid = co.confrelid
JOIN pg_namespace rn ON rn.oid = rf.relnamespace
WHERE n.nspname = 'distribuidorajmerp' AND co.contype = 'f'
  AND rn.nspname NOT IN ('distribuidorajmerp', 'auth')
UNION ALL
SELECT 'fuga_funcion', p.proname::text, 'cuerpo o search_path referencia instemaq'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'distribuidorajmerp' AND p.prokind IN ('f','p')
  AND (coalesce(p.prosrc,'') || ' ' || coalesce(array_to_string(p.proconfig, ' '), ''))
      ~ '(^|[^a-zA-Z0-9_])instemaq([^a-zA-Z0-9_]|$)'
UNION ALL
SELECT 'fuga_policy', c.relname::text, pol.polname::text
FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'distribuidorajmerp'
  AND (coalesce(pg_get_expr(pol.polqual, pol.polrelid),'') || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid),''))
      ~ '(^|[^a-zA-Z0-9_])instemaq([^a-zA-Z0-9_]|$)'
UNION ALL
SELECT 'fuga_vista', c.relname::text, 'definicion referencia instemaq'
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'distribuidorajmerp' AND c.relkind IN ('v','m')
  AND pg_get_viewdef(c.oid, true) ~ '(^|[^a-zA-Z0-9_])instemaq([^a-zA-Z0-9_]|$)'
UNION ALL
SELECT 'fuga_default', c.relname::text, a.attname::text
FROM pg_attrdef ad
JOIN pg_class c ON c.oid = ad.adrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
WHERE n.nspname = 'distribuidorajmerp'
  AND pg_get_expr(ad.adbin, ad.adrelid) ~ '(^|[^a-zA-Z0-9_])instemaq([^a-zA-Z0-9_]|$)';

-- 3) Filas por tabla (esperado: 0 en todo salvo modulos / empresas / usuarios
--    / empresa_modulos, que se siembran en los scripts 02 y 03) -----------------
SELECT c.relname::text AS tabla,
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname),
                           false, true, '')))[1]::text::bigint AS filas
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'distribuidorajmerp' AND c.relkind = 'r'
ORDER BY 2 DESC, 1;
