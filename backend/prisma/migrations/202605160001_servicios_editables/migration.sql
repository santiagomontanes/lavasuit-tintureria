-- Servicios editables / personalizables / soft-delete / auditoría
ALTER TABLE `Servicio`
  ADD COLUMN `categoria`        VARCHAR(60)  NULL AFTER `descripcion`,
  ADD COLUMN `esPersonalizado`  BOOLEAN      NOT NULL DEFAULT false AFTER `activo`,
  ADD COLUMN `creadoPorId`      VARCHAR(191) NULL AFTER `esPersonalizado`,
  ADD COLUMN `actualizadoPorId` VARCHAR(191) NULL AFTER `creadoPorId`,
  ADD COLUMN `updatedAt`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) AFTER `createdAt`,
  ADD COLUMN `deletedAt`        DATETIME(3)  NULL AFTER `updatedAt`;

ALTER TABLE `Servicio`
  ADD CONSTRAINT `Servicio_creadoPorId_fkey`
    FOREIGN KEY (`creadoPorId`) REFERENCES `Usuario`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `Servicio_actualizadoPorId_fkey`
    FOREIGN KEY (`actualizadoPorId`) REFERENCES `Usuario`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `Servicio_activo_idx`    ON `Servicio`(`activo`);
CREATE INDEX `Servicio_deletedAt_idx` ON `Servicio`(`deletedAt`);
CREATE INDEX `Servicio_categoria_idx` ON `Servicio`(`categoria`);
