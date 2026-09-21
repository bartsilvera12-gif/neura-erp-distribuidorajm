-- ============================================================================
-- 26. Tablas de asientos contables — lo que faltaba para guardar una compra
-- ============================================================================
--
-- Síntoma: "No se pudo guardar la compra. Revisá los datos e intentá nuevamente."
-- y la compra no queda en la base.
--
-- Guardar una compra genera un asiento contable SIEMPRE, dentro de la misma
-- transacción: si el asiento falla, se deshace todo y la compra no se guarda.
-- Y el asiento necesita `asientos_contables`, `asientos_contables_detalles` y
-- una función de numeración que este schema no tenía.
--
-- El número de asiento lo pedía como `neura.next_numero_asiento_empresa`, con
-- el schema de la agencia escrito fijo. Eso ya se corrigió en el código para
-- que use el schema de la empresa; acá se crea la función que va a buscar.
--
-- También se crean las funciones de numeración de órdenes de compra y de
-- recepciones, que tenían el mismo problema y habrían fallado apenas se usen.
--
-- Alcance: SOLO el schema `distribuidorajmerp`. No toca `public` ni ningún otro.
-- Idempotente: volver a correrlo no crea nada de nuevo ni reinicia contadores.
-- ============================================================================

-- ── 1. Tablas del asiento ──────────────────────────────────────────────────
DO $$
DECLARE
  v_schema  text := 'distribuidorajmerp';
  v_creadas text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass(v_schema || '.asientos_contables') IS NULL THEN
    EXECUTE format($f$
      CREATE TABLE %I.asientos_contables (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id     uuid NOT NULL,
        numero_asiento text NOT NULL,
        fecha_contable date NOT NULL,
        glosa          text,
        estado         text NOT NULL DEFAULT 'contabilizado',
        -- De qué documento salió: compra, venta, gasto, pago…
        origen_tipo    text,
        origen_id      uuid,
        evento_origen  text,
        moneda         text NOT NULL DEFAULT 'PYG',
        tipo_cambio    numeric NOT NULL DEFAULT 1,
        -- Para el asiento de reversa: apunta al que revierte.
        asiento_original_id uuid,
        created_by     uuid,
        created_at     timestamptz NOT NULL DEFAULT now(),
        -- Un documento genera UN asiento por evento. Sin esto, un reintento
        -- después de un error de red duplicaría el asiento.
        CONSTRAINT asientos_origen_unico UNIQUE (empresa_id, origen_tipo, origen_id, evento_origen)
      )
    $f$, v_schema);
    EXECUTE format('CREATE INDEX idx_asientos_empresa_fecha ON %I.asientos_contables (empresa_id, fecha_contable)', v_schema);
    v_creadas := v_creadas || 'asientos_contables'::text;
  END IF;

  IF to_regclass(v_schema || '.asientos_contables_detalles') IS NULL THEN
    EXECUTE format($f$
      CREATE TABLE %I.asientos_contables_detalles (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id         uuid NOT NULL,
        asiento_id         uuid NOT NULL REFERENCES %I.asientos_contables(id) ON DELETE CASCADE,
        cuenta_contable_id uuid NOT NULL,
        proveedor_id       uuid,
        descripcion        text,
        debe               numeric NOT NULL DEFAULT 0,
        haber              numeric NOT NULL DEFAULT 0,
        documento_tipo     text,
        documento_id       uuid,
        created_at         timestamptz NOT NULL DEFAULT now()
      )
    $f$, v_schema, v_schema);
    EXECUTE format('CREATE INDEX idx_asiento_det_asiento ON %I.asientos_contables_detalles (empresa_id, asiento_id)', v_schema);
    EXECUTE format('CREATE INDEX idx_asiento_det_cuenta ON %I.asientos_contables_detalles (empresa_id, cuenta_contable_id)', v_schema);
    v_creadas := v_creadas || 'asientos_contables_detalles'::text;
  END IF;

  -- Contadores de numeración, uno por empresa y por tipo de documento.
  IF to_regclass(v_schema || '.asiento_correlativos') IS NULL THEN
    EXECUTE format($f$
      CREATE TABLE %I.asiento_correlativos (
        empresa_id    uuid PRIMARY KEY,
        ultimo_numero bigint NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    $f$, v_schema);
    v_creadas := v_creadas || 'asiento_correlativos'::text;
  END IF;

  IF to_regclass(v_schema || '.orden_correlativos') IS NULL THEN
    EXECUTE format($f$
      CREATE TABLE %I.orden_correlativos (
        empresa_id    uuid PRIMARY KEY,
        ultimo_numero bigint NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    $f$, v_schema);
    v_creadas := v_creadas || 'orden_correlativos'::text;
  END IF;

  IF to_regclass(v_schema || '.recepcion_correlativos') IS NULL THEN
    EXECUTE format($f$
      CREATE TABLE %I.recepcion_correlativos (
        empresa_id    uuid PRIMARY KEY,
        ultimo_numero bigint NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    $f$, v_schema);
    v_creadas := v_creadas || 'recepcion_correlativos'::text;
  END IF;

  IF array_length(v_creadas, 1) IS NULL THEN
    RAISE NOTICE 'tablas: no faltaba ninguna.';
  ELSE
    RAISE NOTICE 'tablas creadas: %', array_to_string(v_creadas, ', ');
  END IF;
END;
$$;

-- ── 2. Funciones de numeración ─────────────────────────────────────────────
-- Reservan el siguiente número de forma atómica: dos altas simultáneas no se
-- llevan el mismo. `CREATE OR REPLACE` no reinicia el contador, que vive en la
-- tabla de correlativos.
CREATE OR REPLACE FUNCTION distribuidorajmerp.next_numero_asiento_empresa(p_empresa_id uuid)
RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v_num bigint;
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'next_numero_asiento_empresa: empresa_id es obligatorio';
  END IF;
  INSERT INTO distribuidorajmerp.asiento_correlativos (empresa_id, ultimo_numero)
  VALUES (p_empresa_id, 0) ON CONFLICT (empresa_id) DO NOTHING;

  UPDATE distribuidorajmerp.asiento_correlativos c
     SET ultimo_numero = c.ultimo_numero + 1, updated_at = now()
   WHERE c.empresa_id = p_empresa_id
   RETURNING c.ultimo_numero INTO v_num;

  IF v_num IS NULL THEN
    RAISE EXCEPTION 'No se pudo reservar correlativo de asiento';
  END IF;
  RETURN 'AS-' || lpad(v_num::text, 6, '0');
END;
$f$;

CREATE OR REPLACE FUNCTION distribuidorajmerp.next_numero_orden_empresa(p_empresa_id uuid)
RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v_num bigint;
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'next_numero_orden_empresa: empresa_id es obligatorio';
  END IF;
  INSERT INTO distribuidorajmerp.orden_correlativos (empresa_id, ultimo_numero)
  VALUES (p_empresa_id, 0) ON CONFLICT (empresa_id) DO NOTHING;
  UPDATE distribuidorajmerp.orden_correlativos c
     SET ultimo_numero = c.ultimo_numero + 1, updated_at = now()
   WHERE c.empresa_id = p_empresa_id
   RETURNING c.ultimo_numero INTO v_num;
  IF v_num IS NULL THEN
    RAISE EXCEPTION 'No se pudo reservar correlativo de orden de compra';
  END IF;
  RETURN 'OC-' || lpad(v_num::text, 6, '0');
END;
$f$;

CREATE OR REPLACE FUNCTION distribuidorajmerp.next_numero_recepcion_empresa(p_empresa_id uuid)
RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v_num bigint;
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'next_numero_recepcion_empresa: empresa_id es obligatorio';
  END IF;
  INSERT INTO distribuidorajmerp.recepcion_correlativos (empresa_id, ultimo_numero)
  VALUES (p_empresa_id, 0) ON CONFLICT (empresa_id) DO NOTHING;
  UPDATE distribuidorajmerp.recepcion_correlativos c
     SET ultimo_numero = c.ultimo_numero + 1, updated_at = now()
   WHERE c.empresa_id = p_empresa_id
   RETURNING c.ultimo_numero INTO v_num;
  IF v_num IS NULL THEN
    RAISE EXCEPTION 'No se pudo reservar correlativo de recepción';
  END IF;
  RETURN 'RC-' || lpad(v_num::text, 6, '0');
END;
$f$;

-- ── 3. Permisos y RLS ──────────────────────────────────────────────────────
DO $$
DECLARE
  v_schema text := 'distribuidorajmerp';
  v_modelo text;
  v_tabla  text;
  r        record;
BEGIN
  SELECT c.relname INTO v_modelo
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = v_schema AND c.relkind = 'r'
     AND c.relname IN ('ventas','clientes','productos','usuarios')
   ORDER BY array_position(ARRAY['ventas','clientes','productos','usuarios'], c.relname) LIMIT 1;
  IF v_modelo IS NULL THEN
    RAISE EXCEPTION 'no encontré una tabla de referencia en % para copiar permisos', v_schema;
  END IF;

  FOREACH v_tabla IN ARRAY ARRAY['asientos_contables','asientos_contables_detalles',
                                 'asiento_correlativos','orden_correlativos','recepcion_correlativos'] LOOP
    CONTINUE WHEN to_regclass(v_schema || '.' || v_tabla) IS NULL;
    FOR r IN SELECT DISTINCT grantee, privilege_type FROM information_schema.role_table_grants
              WHERE table_schema = v_schema AND table_name = v_modelo AND grantee <> 'PUBLIC'
    LOOP
      EXECUTE format('GRANT %s ON TABLE %I.%I TO %I', r.privilege_type, v_schema, v_tabla, r.grantee);
    END LOOP;
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', v_schema, v_tabla);
  END LOOP;
  RAISE NOTICE 'permisos y RLS aplicados (modelo: %).', v_modelo;
END;
$$;

GRANT EXECUTE ON FUNCTION distribuidorajmerp.next_numero_asiento_empresa(uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION distribuidorajmerp.next_numero_orden_empresa(uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION distribuidorajmerp.next_numero_recepcion_empresa(uuid) TO service_role, authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────────
-- Todo lo que hace falta para que una compra se guarde.
SELECT objeto, tipo,
       CASE WHEN existe THEN 'ok' ELSE '✗ FALTA' END AS estado
  FROM (
    SELECT 'asientos_contables' AS objeto, 'tabla' AS tipo,
           to_regclass('distribuidorajmerp.asientos_contables') IS NOT NULL AS existe
    UNION ALL SELECT 'asientos_contables_detalles', 'tabla',
           to_regclass('distribuidorajmerp.asientos_contables_detalles') IS NOT NULL
    UNION ALL SELECT 'periodos_contables', 'tabla',
           to_regclass('distribuidorajmerp.periodos_contables') IS NOT NULL
    UNION ALL SELECT 'configuracion_contable', 'tabla',
           to_regclass('distribuidorajmerp.configuracion_contable') IS NOT NULL
    UNION ALL SELECT 'plan_cuentas', 'tabla',
           to_regclass('distribuidorajmerp.plan_cuentas') IS NOT NULL
    UNION ALL SELECT 'compra_items', 'tabla',
           to_regclass('distribuidorajmerp.compra_items') IS NOT NULL
    UNION ALL SELECT 'movimientos_inventario', 'tabla',
           to_regclass('distribuidorajmerp.movimientos_inventario') IS NOT NULL
    UNION ALL SELECT 'next_numero_asiento_empresa', 'función',
           EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'distribuidorajmerp' AND p.proname = 'next_numero_asiento_empresa')
    UNION ALL SELECT 'next_numero_orden_empresa', 'función',
           EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'distribuidorajmerp' AND p.proname = 'next_numero_orden_empresa')
    UNION ALL SELECT 'next_numero_recepcion_empresa', 'función',
           EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'distribuidorajmerp' AND p.proname = 'next_numero_recepcion_empresa')
  ) t
 ORDER BY (CASE WHEN existe THEN 1 ELSE 0 END), objeto;

-- Las cuentas que la compra va a usar. Si alguna sale vacía, el asiento no se
-- puede armar y la compra no se guarda. Va en un bloque para que, si todavía
-- falta la configuración contable, lo diga en vez de cortar el script.
DO $$
DECLARE
  r record;
  v_hay boolean;
BEGIN
  IF to_regclass('distribuidorajmerp.configuracion_contable') IS NULL THEN
    RAISE NOTICE 'configuracion_contable no existe: corré primero la migración 20.';
    RETURN;
  END IF;

  FOR r IN
    EXECUTE $q$
      SELECT 'caja' AS campo, p.cuenta, p.denominacion
        FROM distribuidorajmerp.configuracion_contable c
        LEFT JOIN distribuidorajmerp.plan_cuentas p ON p.id = c.cuenta_caja_id
      UNION ALL SELECT 'proveedores', p.cuenta, p.denominacion
        FROM distribuidorajmerp.configuracion_contable c
        LEFT JOIN distribuidorajmerp.plan_cuentas p ON p.id = c.cuenta_proveedores_id
      UNION ALL SELECT 'iva credito 10', p.cuenta, p.denominacion
        FROM distribuidorajmerp.configuracion_contable c
        LEFT JOIN distribuidorajmerp.plan_cuentas p ON p.id = c.cuenta_iva_credito_10_id
    $q$
  LOOP
    v_hay := r.cuenta IS NOT NULL;
    RAISE NOTICE 'cuenta %: %', rpad(r.campo, 16),
      CASE WHEN v_hay THEN r.cuenta || ' — ' || r.denominacion ELSE '✗ SIN CONFIGURAR' END;
  END LOOP;
END;
$$;
