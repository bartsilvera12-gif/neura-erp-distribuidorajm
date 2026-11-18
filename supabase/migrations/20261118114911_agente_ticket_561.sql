-- Cambios de estructura aplicados por el Agente IA (ticket #561, neura-erp-distribuidorajm). Ya están en la base.

-- Guardar el código (SKU) real del producto en cada línea de factura para mostrarlo en la factura electrónica.
alter table distribuidorajmerp.factura_items add column if not exists codigo_producto text;
