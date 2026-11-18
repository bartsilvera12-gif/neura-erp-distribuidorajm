-- Cambios de estructura aplicados por el Agente IA (ticket #561, neura-erp-distribuidorajm). Ya están en la base.

-- Lista editable de repartidores que rinden efectivo en caja
create table if not exists distribuidorajmerp.caja_repartidores (id uuid primary key default gen_random_uuid(), empresa_id uuid not null, nombre text not null, activo boolean not null default true, orden integer not null default 0, created_at timestamptz not null default now());
grant INSERT, SELECT, UPDATE, DELETE on "distribuidorajmerp".caja_repartidores to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on "distribuidorajmerp".caja_repartidores to service_role;
alter table "distribuidorajmerp".caja_repartidores enable row level security;


-- Guardar a qué repartidor pertenece un ingreso manual (rendición)
alter table distribuidorajmerp.caja_movimientos add column if not exists repartidor_id uuid;
