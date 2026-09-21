-- ============================================================================
-- 21. Diagnóstico: por qué la caja del repartidor muestra el depósito
-- ============================================================================
--
-- SOLO LECTURA. No crea, no borra, no modifica nada. Es para ver en qué estado
-- están los datos antes de tocar algo.
--
-- La caja decide qué catálogo mostrar así:
--   1. ¿Hay un reparto elegido? → el camión de ese reparto.
--   2. Si no, ¿el usuario logueado tiene un camión asignado? → ese camión.
--   3. Si no → el salón.
-- Y para mostrar la carga de un camión necesita que ese camión tenga
-- `ubicacion_id`. Sin eso no hay forma de saber qué lleva arriba.
--
-- Estas cuatro consultas dicen exactamente dónde se corta la cadena.
-- ============================================================================

-- 1) Usuarios y su rol. El catálogo se acota al camión solo para el rol
--    `vendedor_movil`; con cualquier otro rol la caja vende del salón.
SELECT u.email,
       u.nombre,
       u.rol,
       CASE
         WHEN lower(btrim(coalesce(u.rol, ''))) IN ('vendedor_movil', 'vendedor movil', 'vendedor móvil')
           THEN 'sí — vende de su camión'
         ELSE 'no — vende del salón'
       END AS es_vendedor_movil
  FROM distribuidorajmerp.usuarios u
 WHERE coalesce(u.activo, true)
 ORDER BY u.rol, u.email;

-- 2) Los camiones: ¿tienen dueño y ubicación de inventario?
--    · sin `repartidor_id` → el repartidor logueado no encuentra "su" camión.
--    · sin `ubicacion_id`  → no se sabe qué lleva arriba, y hasta ahora eso
--      hacía que la caja mostrara el depósito entero.
SELECT c.alias AS camion,
       c.activo,
       coalesce(u.nombre, u.email, '— SIN REPARTIDOR ASIGNADO —') AS repartidor,
       CASE WHEN c.ubicacion_id IS NULL
            THEN '— SIN UBICACIÓN DE INVENTARIO —'
            ELSE coalesce(iu.nombre, c.ubicacion_id::text)
       END AS ubicacion
  FROM distribuidorajmerp.camiones c
  LEFT JOIN distribuidorajmerp.usuarios u ON u.id = c.repartidor_id
  LEFT JOIN distribuidorajmerp.inventario_ubicaciones iu ON iu.id = c.ubicacion_id
 ORDER BY c.activo DESC, c.alias;

-- 3) Repartos abiertos. Uno de un día anterior es uno que nadie cerró: la venta
--    de hoy se le suma a esa jornada.
SELECT r.fecha,
       c.alias AS camion,
       coalesce(u.nombre, u.email, '—') AS repartidor,
       r.estado,
       CASE WHEN r.fecha = (now() AT TIME ZONE 'America/Asuncion')::date
            THEN 'de hoy'
            ELSE '⚠ de otro día, sigue abierto'
       END AS al_dia
  FROM distribuidorajmerp.repartos r
  JOIN distribuidorajmerp.camiones c ON c.id = r.camion_id
  LEFT JOIN distribuidorajmerp.usuarios u ON u.id = r.repartidor_id
 WHERE r.estado = 'abierto'
 ORDER BY r.fecha DESC;

-- 4) Qué hay arriba de cada camión según el inventario por ubicación. Si esto
--    viene vacío para un camión, su caja no tiene nada que ofrecer (que es lo
--    correcto: el camión está descargado).
SELECT iu.nombre AS ubicacion,
       p.nombre  AS producto,
       su.stock_actual
  FROM distribuidorajmerp.inventario_stock_ubicacion su
  JOIN distribuidorajmerp.inventario_ubicaciones iu ON iu.id = su.ubicacion_id
  JOIN distribuidorajmerp.productos p ON p.id = su.producto_id
 WHERE lower(btrim(coalesce(iu.tipo, ''))) = 'camion'
   AND su.stock_actual <> 0
 ORDER BY iu.nombre, p.nombre;
