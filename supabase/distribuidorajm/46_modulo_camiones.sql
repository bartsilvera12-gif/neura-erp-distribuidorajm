-- =============================================================================
-- 46 · MÓDULO CAMIONES (adiós a los repartos)
-- =============================================================================
-- 1. Da de alta el módulo `camiones` en el catálogo y lo activa para la
--    empresa: así aparece "Camiones" en el menú (Operaciones).
-- 2. Cierra los repartos que hayan quedado abiertos. Desde ahora no se abren
--    más: quien tiene un camión asignado vende directo de ese camión, y la
--    carga entra por Compras (destino = el camión). El stock de cada camión
--    NO se toca: queda tal cual estaba arriba.
-- 3. Compras sin timbrado ni cuenta contable: si esas columnas quedaron
--    obligatorias (NOT NULL) del schema original, deja de serlo. No se borra
--    nada.
--
-- Solo toca el schema `distribuidorajmerp`. Idempotente: se puede volver a
-- correr.
-- =============================================================================

DO $camiones$
DECLARE
  v_empresa_id uuid := '058efef5-e1b5-4cab-8a65-238f81823917';
  v_modulo_id  uuid;
  v_cerrados   int := 0;
BEGIN
  -- ------------------------------------------------------- 1. el módulo
  INSERT INTO distribuidorajmerp.modulos (nombre, slug)
  SELECT 'Camiones', 'camiones'
   WHERE NOT EXISTS (SELECT 1 FROM distribuidorajmerp.modulos
                      WHERE lower(btrim(slug)) = 'camiones');

  SELECT id INTO v_modulo_id
    FROM distribuidorajmerp.modulos
   WHERE lower(btrim(slug)) = 'camiones'
   LIMIT 1;

  INSERT INTO distribuidorajmerp.empresa_modulos (empresa_id, modulo_id, activo)
  SELECT v_empresa_id, v_modulo_id, true
   WHERE NOT EXISTS (SELECT 1 FROM distribuidorajmerp.empresa_modulos
                      WHERE empresa_id = v_empresa_id AND modulo_id = v_modulo_id);

  UPDATE distribuidorajmerp.empresa_modulos
     SET activo = true
   WHERE empresa_id = v_empresa_id AND modulo_id = v_modulo_id AND NOT activo;

  -- ------------------------------------------- 2. repartos abiertos → cerrados
  IF to_regclass('distribuidorajmerp.repartos') IS NOT NULL THEN
    UPDATE distribuidorajmerp.repartos
       SET estado = 'cerrado',
           cerrado_at = COALESCE(cerrado_at, now()),
           notas_cierre = COALESCE(notas_cierre || ' · ', '') || 'Cerrado al pasar al módulo Camiones',
           updated_at = now()
     WHERE empresa_id = v_empresa_id AND estado = 'abierto';
    GET DIAGNOSTICS v_cerrados = ROW_COUNT;
  END IF;

  -- -------------------- 3. compras sin timbrado ni cuenta: no obligatorias
  DECLARE r record; BEGIN
    FOR r IN
      SELECT c.table_name, c.column_name
        FROM information_schema.columns c
       WHERE c.table_schema = 'distribuidorajmerp'
         AND c.is_nullable = 'NO'
         AND (c.table_name, c.column_name) IN (
               ('compras', 'nro_timbrado'),
               ('compras', 'cuenta_contable_id'),
               ('compras', 'cuenta_contrapartida_id'),
               ('compra_items', 'cuenta_contable_id'))
    LOOP
      EXECUTE format('ALTER TABLE distribuidorajmerp.%I ALTER COLUMN %I DROP NOT NULL',
                     r.table_name, r.column_name);
      RAISE NOTICE 'ya no es obligatoria: %.%', r.table_name, r.column_name;
    END LOOP;
  END;

  RAISE NOTICE 'módulo camiones listo; repartos cerrados: %', v_cerrados;
  PERFORM pg_notify('pgrst', 'reload schema');
END;
$camiones$;

-- Control: el módulo activo y quién tiene cada camión.
SELECT m.slug, em.activo
  FROM distribuidorajmerp.empresa_modulos em
  JOIN distribuidorajmerp.modulos m ON m.id = em.modulo_id
 WHERE m.slug = 'camiones';

SELECT c.alias, c.activo, u.email AS asignado_a
  FROM distribuidorajmerp.camiones c
  LEFT JOIN distribuidorajmerp.usuarios u ON u.id = c.repartidor_id
 ORDER BY c.alias;
