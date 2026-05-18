-- Agrega 'RECOLECTOR' al enum Rol. Aditiva, no toca filas existentes.
ALTER TABLE `Usuario`
  MODIFY COLUMN `rol` ENUM('ADMIN','EMPLEADO','CAJERO','RECOLECTOR') NOT NULL DEFAULT 'EMPLEADO';
