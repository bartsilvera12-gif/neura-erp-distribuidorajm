-- Cambios de estructura aplicados por el Agente IA (ticket #460, neura-erp-distribuidorajm). Ya están en la base.

-- Punto de expedición propio de cada camión
alter table distribuidorajmerp.camiones add column if not exists punto_expedicion text;

-- Numeración independiente de facturas por camión
alter table distribuidorajmerp.camiones add column if not exists ultimo_numero_factura bigint not null default 0;

-- Guardar el punto de expedición con el que se emitió cada factura
alter table distribuidorajmerp.facturas add column if not exists punto_expedicion text;
