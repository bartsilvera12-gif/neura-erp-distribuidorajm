-- =============================================================================
-- 41 · IVA por producto + carga de la lista PECHUGÓN (16/09/2026 al 22/09/2026)
--
-- 1. productos.tipo_iva: cada producto guarda su IVA ('5%', '10%', 'EXENTA').
--    La caja lo usa al agregar el producto. Los que ya existían quedan en 10%,
--    que es como se venían vendiendo.
-- 2. Carga los 15 productos de la lista:
--      SKU          = código Pechugón
--      costo        = "Costo"
--      precio venta = "Sugerido Oferta del Comerciante"  (minorista)
--      mayorista    = sale solo en la caja: precio de venta −10%
--      unidad       = KG los que se venden por kilo; UNIDAD los bloques y
--                     paquetes cerrados (18 kg, 16,5 kg, 15 kg)
--    Stock en 0: la mercadería se carga después con una compra o recepción.
--
-- Idempotente: si el código ya existe, ACTUALIZA precio, costo, IVA y unidad
-- en vez de duplicar. Sirve también para cargar la lista de la semana que
-- viene cambiando los números.
--
-- Solo toca distribuidorajmerp.
-- =============================================================================

ALTER TABLE distribuidorajmerp.productos
  ADD COLUMN IF NOT EXISTS tipo_iva text NOT NULL DEFAULT '10%';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'distribuidorajmerp.productos'::regclass
       AND conname = 'productos_tipo_iva_check'
  ) THEN
    ALTER TABLE distribuidorajmerp.productos
      ADD CONSTRAINT productos_tipo_iva_check CHECK (tipo_iva IN ('EXENTA', '5%', '10%'));
  END IF;
END $$;

DO $$
DECLARE
  emp uuid := '058efef5-e1b5-4cab-8a65-238f81823917';
  r   record;
  n_ins int := 0;
  n_act int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM distribuidorajmerp.empresas WHERE id = emp) THEN
    RAISE EXCEPTION 'No encontré la empresa %. No se cargó nada.', emp;
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      -- sku,   nombre,                                        unidad,   iva,   costo,  venta (sugerido)
      ('3673', 'MUSLO EN BLOQUE (18 KG)',                      'UNIDAD', '5%',  169750, 205350),
      ('73',   'MUSLO PAQUETE CONG. POR KG',                   'KG',     '5%',    8800,  10650),
      ('4973', 'MUSLO PAQUETE CONG. (16,5 KG)',                'UNIDAD', '5%',  144950, 175400),
      ('4373', 'MUSLO S/ CADERA CONG. (18 KG)',                'UNIDAD', '5%',  195400, 236450),
      ('3674', 'PECHUGA EN BLOQUE (18 KG)',                    'UNIDAD', '5%',  224750, 271950),
      ('3974', 'PECHUGA PAQUETE CONG. POR KG',                 'KG',     '5%',   12400,  15000),
      ('4974', 'PECHUGA PAQUETE CONG. (16,5 KG)',              'UNIDAD', '5%',  204600, 247550),
      ('1082', 'ALA BLOQUE (15 KG)',                           'UNIDAD', '5%',  217450, 263050),
      ('82',   'ALA ENTERA CONG. PAQUETE POR KG',              'KG',     '5%',   13050,  15750),
      ('4282', 'ALA ENTERA CONG. PAQUETE (16,5 KG)',           'UNIDAD', '5%',  214700, 259750),
      ('1575', 'PUCHERO CONG. (15 KG)',                        'UNIDAD', '5%',   96350, 116550),
      ('75',   'PUCHERO CONGELADO POR KG',                     'KG',     '5%',    6400,   7750),
      ('79',   'GALLINA ENTERA CONG.',                         'KG',     '5%',    9300,  11300),
      ('3316', 'MOLIDA DE POLLO DESHUESADA CONG.',             'KG',     '5%',    4450,   5400),
      ('2590', 'PAPAS PRE FRITAS PEPE CHEF',                   'KG',     '10%',  13100,  15900)
    ) AS v(sku, nombre, unidad, iva, costo, venta)
  LOOP
    UPDATE distribuidorajmerp.productos
       SET nombre = r.nombre, unidad_medida = r.unidad, tipo_iva = r.iva,
           costo_promedio = r.costo, precio_venta = r.venta, activo = true
     WHERE empresa_id = emp AND upper(btrim(sku)) = r.sku;
    IF FOUND THEN
      n_act := n_act + 1;
    ELSE
      INSERT INTO distribuidorajmerp.productos
        (empresa_id, nombre, sku, costo_promedio, precio_venta, stock_actual, stock_minimo,
         unidad_medida, metodo_valuacion, codigo_barras_interno, tipo_iva)
      VALUES
        (emp, r.nombre, r.sku, r.costo, r.venta, 0, 0,
         r.unidad, 'CPP', false, r.iva);
      n_ins := n_ins + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Productos nuevos: %, actualizados: %', n_ins, n_act;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verificación: la lista como quedó, con el mayorista calculado y el margen.
SELECT sku, nombre, unidad_medida AS unidad, tipo_iva AS iva,
       costo_promedio::bigint AS costo,
       precio_venta::bigint AS minorista,
       round(precio_venta * 0.9)::bigint AS mayorista,
       round((precio_venta * 0.9 - costo_promedio) / NULLIF(costo_promedio, 0) * 100, 1) AS margen_mayorista_pct
  FROM distribuidorajmerp.productos
 WHERE empresa_id = '058efef5-e1b5-4cab-8a65-238f81823917'
 ORDER BY nombre;
