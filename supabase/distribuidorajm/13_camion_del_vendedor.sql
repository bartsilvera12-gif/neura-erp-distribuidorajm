-- ============================================================================
-- 13. A qué camión sale cada vendedor
-- ============================================================================
--
-- Hasta ahora el sistema no sabía de qué camión era cada vendedor: el reparto
-- se abría a mano eligiendo camión y repartidor. Si nadie lo abría, las ventas
-- del día quedaban sin camión, el cierre decía "sin reparto" y la mercadería
-- salía del stock general en vez del camión.
--
-- Con esta columna, el camión tiene dueño. El vendedor entra, vende, y el
-- reparto se abre solo con su camión, igual que la caja.
--
-- `ON DELETE SET NULL`: si se da de baja al vendedor, el camión queda sin
-- asignar y no desaparece.
--
-- Idempotente. Solo toca distribuidorajmerp.
-- ============================================================================

ALTER TABLE distribuidorajmerp.camiones
  ADD COLUMN IF NOT EXISTS repartidor_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'distribuidorajmerp.camiones'::regclass
       AND conname = 'camiones_repartidor_id_fkey'
  ) THEN
    ALTER TABLE distribuidorajmerp.camiones
      ADD CONSTRAINT camiones_repartidor_id_fkey
      FOREIGN KEY (repartidor_id)
      REFERENCES distribuidorajmerp.usuarios(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- Un vendedor, un camión: si tuviera dos, abrir el reparto solo tendría que
-- adivinar cuál, que es justo lo que este cambio viene a evitar.
CREATE UNIQUE INDEX IF NOT EXISTS camiones_repartidor_unico
  ON distribuidorajmerp.camiones (empresa_id, repartidor_id)
  WHERE repartidor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_camiones_repartidor
  ON distribuidorajmerp.camiones (repartidor_id);

SELECT pg_notify('pgrst', 'reload schema');

-- Verificación: los camiones y a quién le tocan.
SELECT c.alias,
       COALESCE(u.nombre, u.email, '— sin asignar —') AS repartidor
  FROM distribuidorajmerp.camiones c
  LEFT JOIN distribuidorajmerp.usuarios u ON u.id = c.repartidor_id
 ORDER BY c.alias;
