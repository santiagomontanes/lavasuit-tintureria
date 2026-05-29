-- Número de orden local/offline legible por empleado (ej. SAN-001).
-- Se conserva como referencia aunque el backend asigne el número oficial.
ALTER TABLE `Pedido` ADD COLUMN `numeroLocal` VARCHAR(40) NULL;
