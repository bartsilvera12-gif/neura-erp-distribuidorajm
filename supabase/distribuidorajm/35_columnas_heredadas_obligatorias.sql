-- ============================================================================
-- 35. Columnas heredadas que bloquean el alta
-- ============================================================================
--
-- Síntoma: null value in column "numero_oc" of relation "ordenes_compra"
-- violates not-null constraint.
--
-- `ordenes_compra` venía del schema original con sus propios nombres de
-- columna (`numero_oc`), y el código escribe `numero`. La 34 agregó `numero`,
-- pero `numero_oc` sigue siendo NOT NULL y nadie la completa nunca: cada alta
-- se cae ahí.
--
-- En vez de destapar una columna por vez, esto resuelve la clase entera: en
-- las cuatro tablas del circuito, toda columna que sea NOT NULL, NO tenga
-- valor por defecto y NO esté en la lista de las que el código escribe, deja
-- de ser obligatoria. Una columna así solo puede hacer fallar el alta: nadie
-- la completa nunca.
--
-- No se borra ninguna columna ni ningún dato: solo se saca la obligatoriedad.
-- Al final imprime exactamente qué tocó.
--
-- Alcance: SOLO el schema `distribuidorajmerp`. No toca `public` ni ningún otro.
-- Idempotente: volver a correrlo no cambia nada.
-- ============================================================================

DO $$
DECLARE
  v_schema  text := 'distribuidorajmerp';
  v_hechas  text[] := ARRAY[]::text[];
  v_fila    record;
  -- Lo que el código sí escribe, tabla por tabla. Sacado de sus INSERT/UPDATE.
  v_escritas jsonb := jsonb_build_object(
    'ordenes_compra', jsonb_build_array(
      'id','empresa_id','numero','proveedor_id','proveedor_nombre','fecha',
      'fecha_estimada','observaciones','moneda','tipo_cambio','total_estimado',
      'estado','idempotency_key','created_by','usuario_nombre','aprobada_by',
      'aprobada_at','cancelada_by','cancelada_at','motivo_cancelacion',
      'cerrada_by','cerrada_at','motivo_cierre','cierre_automatico',
      'created_at','updated_at'),
    'orden_compra_items', jsonb_build_array(
      'id','empresa_id','orden_id','producto_id','producto_nombre','descripcion',
      'cantidad','costo_unitario_estimado','iva_tipo','cuenta_contable_id',
      'orden_linea','created_at'),
    'recepciones', jsonb_build_array(
      'id','empresa_id','numero','orden_id','proveedor_id','proveedor_nombre',
      'fecha','ubicacion_id','observacion','documento_url','estado',
      'estado_facturacion','excedente_confirmado','motivo_excedente',
      'idempotency_key','created_by','usuario_nombre','created_at','updated_at'),
    'recepcion_items', jsonb_build_array(
      'id','empresa_id','recepcion_id','orden_item_id','producto_id',
      'producto_nombre','cantidad_recibida','costo_unitario_recibido',
      'cantidad_facturada','movimiento_id','created_at')
  );
BEGIN
  FOR v_fila IN
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
     WHERE c.table_schema = v_schema
       AND c.table_name IN ('ordenes_compra','orden_compra_items','recepciones','recepcion_items')
       AND c.is_nullable = 'NO'
       AND c.column_default IS NULL
       AND c.is_generated = 'NEVER'
       -- Las que el código sí completa se dejan como están.
       AND NOT (v_escritas -> c.table_name ? c.column_name)
     ORDER BY c.table_name, c.column_name
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I DROP NOT NULL',
                   v_schema, v_fila.table_name, v_fila.column_name);
    v_hechas := v_hechas || (v_fila.table_name || '.' || v_fila.column_name)::text;
  END LOOP;

  IF array_length(v_hechas, 1) IS NULL THEN
    RAISE NOTICE 'ninguna columna heredada bloqueaba el alta.';
  ELSE
    RAISE NOTICE 'dejaron de ser obligatorias: %', array_to_string(v_hechas, ', ');
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────────
-- No debe quedar NINGUNA fila: cada una sería un alta que se va a caer.
SELECT c.table_name AS tabla, c.column_name AS campo,
       c.data_type AS tipo, '✗ obligatoria y nadie la completa' AS estado
  FROM information_schema.columns c
 WHERE c.table_schema = 'distribuidorajmerp'
   AND c.table_name IN ('ordenes_compra','orden_compra_items','recepciones','recepcion_items')
   AND c.is_nullable = 'NO'
   AND c.column_default IS NULL
   AND c.is_generated = 'NEVER'
   AND c.column_name NOT IN (
     'id','empresa_id','numero','proveedor_id','proveedor_nombre','fecha',
     'fecha_estimada','observaciones','moneda','tipo_cambio','total_estimado',
     'estado','idempotency_key','created_by','usuario_nombre','aprobada_by',
     'aprobada_at','cancelada_by','cancelada_at','motivo_cancelacion',
     'cerrada_by','cerrada_at','motivo_cierre','cierre_automatico',
     'created_at','updated_at','orden_id','producto_id','descripcion','cantidad',
     'costo_unitario_estimado','iva_tipo','cuenta_contable_id','orden_linea',
     'ubicacion_id','observacion','documento_url','estado_facturacion',
     'excedente_confirmado','motivo_excedente','recepcion_id','orden_item_id',
     'producto_nombre','cantidad_recibida','costo_unitario_recibido',
     'cantidad_facturada','movimiento_id'
   )
 ORDER BY c.table_name, c.column_name;
