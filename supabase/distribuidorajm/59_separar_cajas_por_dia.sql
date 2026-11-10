-- SQL 59 · Separar por día las cajas que quedaron abiertas de un día para otro
-- Solo schema distribuidorajmerp. No borra ni cambia montos: solo pasa cada
-- venta y movimiento de caja a la caja del día en que se hizo.
DO $$
DECLARE
  tz constant text := 'America/Asuncion';
  hoy date := (now() AT TIME ZONE tz)::date;
  c record;
  d date;
  destino uuid;
  n int;
BEGIN
  -- Cajas con movimientos o ventas de un día posterior al día en que se abrieron.
  FOR c IN
    SELECT k.id, k.empresa_id, k.abierta_por, k.estado, (k.fecha_apertura AT TIME ZONE tz)::date AS dia
      FROM distribuidorajmerp.cajas k
     WHERE (k.fecha_apertura AT TIME ZONE tz)::date >= DATE '2026-11-08'  -- solo las de estos días
       AND (EXISTS (SELECT 1 FROM distribuidorajmerp.caja_movimientos m
                    WHERE m.caja_id = k.id AND (m.created_at AT TIME ZONE tz)::date > (k.fecha_apertura AT TIME ZONE tz)::date)
        OR EXISTS (SELECT 1 FROM distribuidorajmerp.ventas v
                    WHERE v.caja_id = k.id AND (v.fecha AT TIME ZONE tz)::date > (k.fecha_apertura AT TIME ZONE tz)::date))
     ORDER BY k.fecha_apertura
  LOOP
    FOR d IN
      SELECT DISTINCT x.dia FROM (
        SELECT (m.created_at AT TIME ZONE tz)::date AS dia FROM distribuidorajmerp.caja_movimientos m WHERE m.caja_id = c.id
        UNION
        SELECT (v.fecha AT TIME ZONE tz)::date FROM distribuidorajmerp.ventas v WHERE v.caja_id = c.id
      ) x WHERE x.dia > c.dia ORDER BY 1
    LOOP
      destino := NULL;
      -- Para hoy: si el mismo usuario ya tiene una caja abierta hoy, va a esa.
      IF d = hoy THEN
        SELECT k2.id INTO destino FROM distribuidorajmerp.cajas k2
         WHERE k2.empresa_id = c.empresa_id AND k2.estado = 'abierta' AND k2.id <> c.id
           AND k2.abierta_por IS NOT DISTINCT FROM c.abierta_por
           AND (k2.fecha_apertura AT TIME ZONE tz)::date = hoy
         ORDER BY k2.fecha_apertura LIMIT 1;
      END IF;
      IF destino IS NULL THEN
        SELECT COALESCE(max(numero_caja), 0) + 1 INTO n FROM distribuidorajmerp.cajas WHERE empresa_id = c.empresa_id;
        INSERT INTO distribuidorajmerp.cajas (empresa_id, numero_caja, estado, monto_apertura, fecha_apertura, fecha_cierre, abierta_por)
        VALUES (c.empresa_id, n,
                CASE WHEN d < hoy THEN 'cerrada' ELSE 'abierta' END, 0,
                (d::timestamp) AT TIME ZONE tz,
                CASE WHEN d < hoy THEN ((d + time '23:00') AT TIME ZONE tz) END,
                c.abierta_por)
        RETURNING id INTO destino;
        RAISE NOTICE 'Caja % creada para el % (viene de la caja %)', n, d, c.id;
      END IF;
      UPDATE distribuidorajmerp.caja_movimientos SET caja_id = destino
       WHERE caja_id = c.id AND (created_at AT TIME ZONE tz)::date = d;
      UPDATE distribuidorajmerp.ventas SET caja_id = destino
       WHERE caja_id = c.id AND (fecha AT TIME ZONE tz)::date = d;
    END LOOP;
    -- La caja original se cierra a las 23:00 de su día (si seguía abierta).
    UPDATE distribuidorajmerp.cajas SET estado = 'cerrada', fecha_cierre = ((c.dia + time '23:00') AT TIME ZONE tz)
     WHERE id = c.id AND estado = 'abierta';
  END LOOP;
END $$;
