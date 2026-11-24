-- Cambios de estructura aplicados por el Agente IA (ticket #668, neura-erp-distribuidorajm). Ya están en la base.

-- Detalle de facturas/ventas abonadas en un recibo de multicobro
create table if not exists distribuidorajmerp.recibos_cobro_detalle (id uuid primary key default gen_random_uuid(), empresa_id uuid not null, recibo_id uuid not null, venta_id uuid not null, venta_numero text, monto numeric not null, saldo_restante numeric, caja_movimiento_ids uuid[], created_at timestamptz not null default now());
grant TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT on "distribuidorajmerp".recibos_cobro_detalle to anon;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on "distribuidorajmerp".recibos_cobro_detalle to authenticated;
grant TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT on "distribuidorajmerp".recibos_cobro_detalle to service_role;
alter table "distribuidorajmerp".recibos_cobro_detalle enable row level security;

