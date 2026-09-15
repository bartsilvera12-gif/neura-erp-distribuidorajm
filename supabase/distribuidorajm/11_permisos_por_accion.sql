-- =============================================================================
-- 11 · PERMISOS POR ACCIÓN
-- =============================================================================
-- Documento de relevamiento v0.2, pág. 10: "Los permisos deben ser configurables
-- por acción y no estar fijados de forma rígida dentro del código."
--
-- Hasta ahora había dos niveles de permiso: el módulo (¿ve Caja?) y el alcance
-- del rol (¿ve los repartos de todos o solo los suyos?). Falta el tercero: qué
-- puede HACER dentro de un módulo que ya ve.
--
-- Esta tabla guarda solo las excepciones explícitas. Lo que no está acá lo
-- decide el rol, así que dar de alta un usuario no obliga a marcar nueve
-- casillas para que pueda trabajar.
--
-- El catálogo de acciones vive en el código (`src/lib/usuarios/permisos.ts`) y
-- no en la base a propósito: una fila de catálogo que el código no chequea es
-- un permiso que no existe, y se leería como si existiera.
--
-- Idempotente. Solo toca distribuidorajmerp.
-- =============================================================================

CREATE TABLE IF NOT EXISTS distribuidorajmerp.usuario_permisos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES distribuidorajmerp.empresas(id) ON DELETE CASCADE,
  usuario_id  uuid NOT NULL REFERENCES distribuidorajmerp.usuarios(id) ON DELETE CASCADE,
  accion      text NOT NULL,
  permitido   boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  -- Un permiso por usuario y acción: dos filas para lo mismo dejarían el
  -- resultado dependiendo del orden de lectura.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'distribuidorajmerp.usuario_permisos'::regclass
       AND conname = 'usuario_permisos_usuario_accion_key'
  ) THEN
    ALTER TABLE distribuidorajmerp.usuario_permisos
      ADD CONSTRAINT usuario_permisos_usuario_accion_key UNIQUE (usuario_id, accion);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_usuario_permisos_usuario
  ON distribuidorajmerp.usuario_permisos (usuario_id);

SELECT pg_notify('pgrst', 'reload schema');
