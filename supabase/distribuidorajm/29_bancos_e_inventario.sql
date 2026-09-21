-- ============================================================================
-- 29. Catálogo de bancos + inventario de lo que falta en el schema
-- ============================================================================
--
-- Síntoma: Could not find the table 'distribuidorajmerp.bancos' in the schema
-- cache. La pantalla Configuración → Bancos no tiene dónde guardar.
--
-- Vengo destapando una tabla por vez, así que esto hace las dos cosas:
--   1. Crea `bancos` completo (alta, edición, activar/desactivar, orden).
--   2. Lista TODAS las tablas y funciones que el código usa y que este schema
--      no tiene, para no enterarnos de a una cada vez que QA entra a una
--      pantalla nueva. Las 161 tablas y 5 funciones salen del código, no de
--      una lista escrita a mano.
--
-- Alcance: SOLO el schema `distribuidorajmerp`. No toca `public` ni ningún otro.
-- Idempotente: volver a correrlo no crea nada de nuevo ni cambia un solo dato.
-- ============================================================================

-- ── 1. El catálogo de bancos ───────────────────────────────────────────────
DO $$
DECLARE
  v_schema text := 'distribuidorajmerp';
BEGIN
  IF to_regclass(v_schema || '.bancos') IS NULL THEN
    EXECUTE format($f$
      CREATE TABLE %I.bancos (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id  uuid NOT NULL,
        nombre      text NOT NULL,
        -- Nombre normalizado (mayúsculas, espacios colapsados): es la clave
        -- del control de duplicados, para que "Itaú" y "ITAU " no convivan.
        nombre_norm text NOT NULL,
        activo      boolean NOT NULL DEFAULT true,
        sort_order  integer NOT NULL DEFAULT 0,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT bancos_empresa_nombre_unico UNIQUE (empresa_id, nombre_norm)
      )
    $f$, v_schema);
    EXECUTE format('CREATE INDEX idx_bancos_empresa ON %I.bancos (empresa_id, activo, sort_order)', v_schema);
    RAISE NOTICE 'creada: bancos';
  ELSE
    RAISE NOTICE 'bancos ya existia.';
  END IF;

  -- Los permisos que PostgREST necesita para verla. Sin esto la tabla existe
  -- pero la pantalla sigue diciendo que no la encuentra.
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.bancos TO authenticated', v_schema);
  EXECUTE format('GRANT ALL ON %I.bancos TO postgres, service_role', v_schema);
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ── 2. Inventario: qué más falta ───────────────────────────────────────────
-- Todo lo que el código busca en este schema. Lo que salga acá es una pantalla
-- que va a fallar apenas alguien entre.
WITH esperado(objeto, clase) AS (
  VALUES
    ('agenda_cita_responsables', 'tabla'),
    ('agenda_citas', 'tabla'),
    ('agent_device_tokens', 'tabla'),
    ('agent_notification_events', 'tabla'),
    ('asientos_contables', 'tabla'),
    ('asientos_contables_detalles', 'tabla'),
    ('assistant_conversations', 'tabla'),
    ('assistant_messages', 'tabla'),
    ('ayuda_articulo_adjuntos', 'tabla'),
    ('ayuda_articulo_feedback', 'tabla'),
    ('ayuda_articulo_versiones', 'tabla'),
    ('ayuda_articulos', 'tabla'),
    ('ayuda_categorias', 'tabla'),
    ('bancos', 'tabla'),
    ('caja_movimientos', 'tabla'),
    ('cajas', 'tabla'),
    ('camiones', 'tabla'),
    ('categorias_productos', 'tabla'),
    ('cc_daily_assignment_counter', 'tabla'),
    ('chat_agents', 'tabla'),
    ('chat_campaign_button_actions', 'tabla'),
    ('chat_campaign_events', 'tabla'),
    ('chat_campaign_jobs', 'tabla'),
    ('chat_campaign_recipients', 'tabla'),
    ('chat_campaign_templates', 'tabla'),
    ('chat_campaigns', 'tabla'),
    ('chat_channel_quick_replies', 'tabla'),
    ('chat_channels', 'tabla'),
    ('chat_comprobante_validaciones', 'tabla'),
    ('chat_contacts', 'tabla'),
    ('chat_conversation_attribution', 'tabla'),
    ('chat_conversation_closures', 'tabla'),
    ('chat_conversation_tag_history', 'tabla'),
    ('chat_conversation_tags', 'tabla'),
    ('chat_conversations', 'tabla'),
    ('chat_empresa_operator_roles', 'tabla'),
    ('chat_flow_data', 'tabla'),
    ('chat_flow_events', 'tabla'),
    ('chat_flow_node_blocks', 'tabla'),
    ('chat_flow_nodes', 'tabla'),
    ('chat_flow_options', 'tabla'),
    ('chat_flow_recontact_rules', 'tabla'),
    ('chat_flow_recontact_runs', 'tabla'),
    ('chat_flow_sessions', 'tabla'),
    ('chat_flows', 'tabla'),
    ('chat_interno_mensajes', 'tabla'),
    ('chat_interno_miembros', 'tabla'),
    ('chat_interno_salas', 'tabla'),
    ('chat_messages', 'tabla'),
    ('chat_omnicanal_work_schedules', 'tabla'),
    ('chat_queue_channels', 'tabla'),
    ('chat_queue_closure_states', 'tabla'),
    ('chat_queue_closure_substates', 'tabla'),
    ('chat_queue_supervisors', 'tabla'),
    ('chat_queues', 'tabla'),
    ('chat_routing_events', 'tabla'),
    ('chat_supervisor_agents', 'tabla'),
    ('chat_usuario_omnicanal', 'tabla'),
    ('cliente_historial', 'tabla'),
    ('cliente_obligaciones_tributarias', 'tabla'),
    ('cliente_perfil_tributario', 'tabla'),
    ('cliente_tipos_servicio_catalogo', 'tabla'),
    ('clientes', 'tabla'),
    ('cobranza_promesas', 'tabla'),
    ('cobros_pendientes', 'tabla'),
    ('comision_escalas', 'tabla'),
    ('comision_overrides', 'tabla'),
    ('comision_periodos', 'tabla'),
    ('comision_politica_versiones', 'tabla'),
    ('comision_politicas', 'tabla'),
    ('compra_items', 'tabla'),
    ('compras', 'tabla'),
    ('configuracion_contable', 'tabla'),
    ('crm_etapas', 'tabla'),
    ('crm_notas', 'tabla'),
    ('crm_prospectos', 'tabla'),
    ('dashboard_views', 'tabla'),
    ('empresa_autoimpresor_config', 'tabla'),
    ('empresa_dashboard_views', 'tabla'),
    ('empresa_facturacion_modo', 'tabla'),
    ('empresa_modulos', 'tabla'),
    ('empresa_outcome_mapping', 'tabla'),
    ('empresa_sifen_config', 'tabla'),
    ('empresas', 'tabla'),
    ('factura_electronica', 'tabla'),
    ('factura_electronica_evento', 'tabla'),
    ('factura_items', 'tabla'),
    ('facturas', 'tabla'),
    ('gasto_items', 'tabla'),
    ('gastos', 'tabla'),
    ('guardias_semana', 'tabla'),
    ('imports_audit', 'tabla'),
    ('inventario_stock_ubicacion', 'tabla'),
    ('inventario_ubicaciones', 'tabla'),
    ('marketing_comentarios', 'tabla'),
    ('marketing_historial_estados', 'tabla'),
    ('marketing_piezas', 'tabla'),
    ('marketing_tasks', 'tabla'),
    ('modulos', 'tabla'),
    ('movimientos_inventario', 'tabla'),
    ('nota_credito', 'tabla'),
    ('nota_credito_electronica', 'tabla'),
    ('nota_credito_evento', 'tabla'),
    ('obligaciones_tributarias_catalogo', 'tabla'),
    ('omnichannel_routes', 'tabla'),
    ('orden_compra_items', 'tabla'),
    ('ordenes_compra', 'tabla'),
    ('pagos', 'tabla'),
    ('periodos_contables', 'tabla'),
    ('plan_cuentas', 'tabla'),
    ('planes', 'tabla'),
    ('producto_categorias', 'tabla'),
    ('productos', 'tabla'),
    ('proveedor_categoria_rel', 'tabla'),
    ('proveedor_categorias', 'tabla'),
    ('proveedores', 'tabla'),
    ('proyecto_archivos', 'tabla'),
    ('proyecto_cambios', 'tabla'),
    ('proyecto_comentarios', 'tabla'),
    ('proyecto_credenciales', 'tabla'),
    ('proyecto_estado_historial', 'tabla'),
    ('proyecto_estados', 'tabla'),
    ('proyecto_prioridades_config', 'tabla'),
    ('proyecto_qa_etapas', 'tabla'),
    ('proyecto_qa_eventos', 'tabla'),
    ('proyecto_qa_grupos', 'tabla'),
    ('proyecto_qa_item_archivos', 'tabla'),
    ('proyecto_qa_items', 'tabla'),
    ('proyecto_qa_observacion_archivos', 'tabla'),
    ('proyecto_qa_observacion_comentarios', 'tabla'),
    ('proyecto_qa_observaciones', 'tabla'),
    ('proyecto_qa_revisiones', 'tabla'),
    ('proyecto_qa_secciones', 'tabla'),
    ('proyecto_slv_objetivos', 'tabla'),
    ('proyecto_tareas', 'tabla'),
    ('proyecto_tipos', 'tabla'),
    ('proyectos', 'tabla'),
    ('recepcion_items', 'tabla'),
    ('recepciones', 'tabla'),
    ('reparto_stock', 'tabla'),
    ('repartos', 'tabla'),
    ('soporte_ticket_archivos', 'tabla'),
    ('soporte_ticket_comentarios', 'tabla'),
    ('soporte_ticket_historial', 'tabla'),
    ('soporte_ticket_relaciones', 'tabla'),
    ('soporte_tickets', 'tabla'),
    ('sorteo_conversaciones', 'tabla'),
    ('sorteo_cupones', 'tabla'),
    ('sorteo_entradas', 'tabla'),
    ('sorteo_revendedor_clicks', 'tabla'),
    ('sorteo_revendedores', 'tabla'),
    ('sorteo_ticket_deliveries', 'tabla'),
    ('sorteos', 'tabla'),
    ('suscripciones', 'tabla'),
    ('tipificaciones', 'tabla'),
    ('usuario_dashboard_views', 'tabla'),
    ('usuario_modulos', 'tabla'),
    ('usuario_notificaciones', 'tabla'),
    ('usuarios', 'tabla'),
    ('ventas', 'tabla'),
    ('ventas_items', 'tabla'),
    ('next_numero_asiento_empresa', 'funcion'),
    ('next_numero_gasto_empresa', 'funcion'),
    ('next_numero_orden_empresa', 'funcion'),
    ('next_numero_recepcion_empresa', 'funcion'),
    ('sin_tildes', 'funcion')
)
SELECT e.objeto, e.clase,
       CASE
         WHEN e.clase = 'funcion' THEN
           CASE WHEN EXISTS (
             SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'distribuidorajmerp' AND p.proname = e.objeto
           ) THEN 'ok' ELSE 'FALTA' END
         ELSE
           CASE WHEN to_regclass('distribuidorajmerp.' || e.objeto) IS NOT NULL
                THEN 'ok' ELSE 'FALTA' END
       END AS estado
  FROM esperado e
 WHERE CASE
         WHEN e.clase = 'funcion' THEN NOT EXISTS (
           SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'distribuidorajmerp' AND p.proname = e.objeto
         )
         ELSE to_regclass('distribuidorajmerp.' || e.objeto) IS NULL
       END
 ORDER BY e.clase, e.objeto;
