-- Cambios de estructura aplicados por el Agente IA (ticket #601, neura-erp-distribuidorajm). Ya están en la base.

-- Descuento % por producto para ciertos clientes (Walter Recalde, Zulma Sosa), automático en la caja.
alter table distribuidorajmerp.clientes add column if not exists descuento_productos jsonb;
