-- ============================================================================
-- 24. Camiones sin ubicación de inventario
-- ============================================================================
--
-- Un camión necesita su propia ubicación de inventario: es la que dice qué
-- lleva arriba. Sin ella el sistema no puede saber qué hay en el camión, y eso
-- se veía de dos formas:
--
--   · La caja del repartidor mostraba el depósito entero en vez de su carga.
--   · Inventario aparecía vacío y un alta nueva parecía no guardarse.
--
-- Los camiones que se dan de alta ahora la reciben solos. Esto es para los que
-- ya estaban: les crea la ubicación que les falta y se las asigna.
--
-- NO mueve stock. Las ubicaciones nuevas nacen vacías, que es lo correcto: si
-- el camión tiene mercadería arriba, se registra con la carga del día.
--
-- Alcance: SOLO el schema `distribuidorajmerp`. No toca `public` ni ningún otro.
-- Idempotente: un camión que ya tiene ubicación no se toca.
-- ============================================================================

DO $$
DECLARE
  v_schema   text := 'distribuidorajmerp';
  v_camion   record;
  v_ubic     uuid;
  v_n        int := 0;
BEGIN
  IF to_regclass(v_schema || '.camiones') IS NULL
     OR to_regclass(v_schema || '.inventario_ubicaciones') IS NULL THEN
    RAISE EXCEPTION 'faltan camiones o inventario_ubicaciones: ¿corriste la 06 y la 09?';
  END IF;

  FOR v_camion IN
    EXECUTE format(
      'SELECT id, empresa_id, alias FROM %I.camiones WHERE ubicacion_id IS NULL ORDER BY alias',
      v_schema)
  LOOP
    -- Si ya existe una ubicación con ese nombre —de un intento anterior— se
    -- reusa en vez de crear una segunda para el mismo camión.
    EXECUTE format(
      'SELECT id FROM %I.inventario_ubicaciones
        WHERE empresa_id = $1::uuid AND lower(btrim(nombre)) = lower(btrim($2))
        LIMIT 1', v_schema)
      INTO v_ubic USING v_camion.empresa_id, 'Camión ' || v_camion.alias;

    IF v_ubic IS NULL THEN
      EXECUTE format(
        'INSERT INTO %I.inventario_ubicaciones (empresa_id, nombre, tipo, activo)
         VALUES ($1::uuid, $2, ''camion'', true) RETURNING id', v_schema)
        INTO v_ubic USING v_camion.empresa_id, 'Camión ' || v_camion.alias;
    END IF;

    EXECUTE format('UPDATE %I.camiones SET ubicacion_id = $1::uuid WHERE id = $2::uuid', v_schema)
      USING v_ubic, v_camion.id;

    RAISE NOTICE 'camión %: ubicación asignada.', v_camion.alias;
    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN
    RAISE NOTICE 'todos los camiones ya tenían ubicación: no se cambió nada.';
  ELSE
    RAISE NOTICE '% camiones arreglados.', v_n;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────────
-- Ninguna fila debería decir "SIN UBICACIÓN". Y "vendedor" es quien ve ese
-- camión en su caja: sin vendedor asignado, el repartidor no lo encuentra.
SELECT c.alias AS camion,
       CASE WHEN c.activo THEN 'activo' ELSE 'de baja' END AS estado,
       coalesce(u.nombre, u.email, '— SIN VENDEDOR ASIGNADO —') AS vendedor,
       CASE WHEN c.ubicacion_id IS NULL
            THEN '✗ SIN UBICACIÓN'
            ELSE coalesce(iu.nombre, 'ok')
       END AS ubicacion
  FROM distribuidorajmerp.camiones c
  LEFT JOIN distribuidorajmerp.usuarios u ON u.id = c.repartidor_id
  LEFT JOIN distribuidorajmerp.inventario_ubicaciones iu ON iu.id = c.ubicacion_id
 ORDER BY c.activo DESC, c.alias;
