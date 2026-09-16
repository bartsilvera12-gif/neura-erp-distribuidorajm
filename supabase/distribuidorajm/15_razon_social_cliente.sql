-- ============================================================================
-- 15. `razon_social` y `ruc_factura` en clientes
-- ============================================================================
--
-- El diagnóstico del 14 confirmó que las dos faltan. `razon_social` es la que
-- corta la auditoría de facturas con "column clientes_1.razon_social does not
-- exist", y las dos hacen falta para facturar en serio: a un cliente se le
-- vende a nombre de la persona que atiende el mostrador, pero la factura va a
-- nombre de la empresa y a veces con otro RUC.
--
-- Es idempotente: se puede correr dos veces sin romper nada. Solo agrega, no
-- toca datos existentes ni borra nada.
--
-- Lo que este script NO agrega, a propósito: `es_qa`, `es_project_manager` y
-- `es_tecnico` en usuarios. Marcan roles de un equipo de proyectos de la
-- agencia —quién hace QA, quién es PM— y acá no significan nada. El selector de
-- vendedor responsable ya funciona sin ellas: el código las saltea cuando el
-- schema no las tiene. Agregar tres columnas que nadie va a llenar es dejar
-- basura en la tabla.
-- ============================================================================

DO $$
DECLARE
  v_schema text := 'distribuidorajmerp';
  v_agregadas text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass(v_schema || '.clientes') IS NULL THEN
    RAISE EXCEPTION 'no existe %.clientes', v_schema;
  END IF;

  -- Razón social: el nombre legal con el que se emite la factura.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = v_schema AND table_name = 'clientes' AND column_name = 'razon_social'
  ) THEN
    EXECUTE format('ALTER TABLE %I.clientes ADD COLUMN razon_social text', v_schema);
    v_agregadas := v_agregadas || 'razon_social'::text;
  END IF;

  -- RUC de facturación, para cuando difiere del RUC del contacto.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = v_schema AND table_name = 'clientes' AND column_name = 'ruc_factura'
  ) THEN
    EXECUTE format('ALTER TABLE %I.clientes ADD COLUMN ruc_factura text', v_schema);
    v_agregadas := v_agregadas || 'ruc_factura'::text;
  END IF;

  IF array_length(v_agregadas, 1) IS NULL THEN
    RAISE NOTICE 'clientes: ya tenía las dos columnas, no se agregó nada.';
  ELSE
    RAISE NOTICE 'clientes: agregadas %.', array_to_string(v_agregadas, ', ');
  END IF;
END;
$$;

-- ── Verificación ───────────────────────────────────────────────────────────
SELECT column_name AS columna, data_type AS tipo, is_nullable AS acepta_nulo
  FROM information_schema.columns
 WHERE table_schema = 'distribuidorajmerp'
   AND table_name = 'clientes'
   AND column_name IN ('razon_social', 'ruc_factura')
 ORDER BY column_name;
