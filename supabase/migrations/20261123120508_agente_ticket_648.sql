-- Cambios de estructura aplicados por el Agente IA (ticket #648, neura-erp-distribuidorajm). Ya están en la base.

-- Punto de expedición 001 exclusivo del administrador (licitaciones) con su propia numeración
create table if not exists distribuidorajmerp.puntos_expedicion_admin (id uuid primary key default gen_random_uuid(), empresa_id uuid not null, punto text not null, descripcion text, ultimo_numero_factura bigint not null default 0, activo boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (empresa_id, punto));
grant INSERT, SELECT, UPDATE, DELETE on "distribuidorajmerp".puntos_expedicion_admin to authenticated;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on "distribuidorajmerp".puntos_expedicion_admin to service_role;
alter table "distribuidorajmerp".puntos_expedicion_admin enable row level security;

