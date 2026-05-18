ALTER TABLE `Cliente` ADD COLUMN `creadoPorId` VARCHAR(191) NULL;

ALTER TABLE `Pedido`
  ADD COLUMN `sesionTrabajoId` VARCHAR(191) NULL,
  ADD COLUMN `eliminadoPorId` VARCHAR(191) NULL;

ALTER TABLE `PedidoItem`
  ADD COLUMN `nombre` VARCHAR(120) NULL,
  ADD COLUMN `colorActual` VARCHAR(80) NULL,
  ADD COLUMN `colorDeseado` VARCHAR(80) NULL,
  ADD COLUMN `observaciones` TEXT NULL;

UPDATE `PedidoItem` pi
INNER JOIN `Servicio` s ON s.`id` = pi.`servicioId`
SET pi.`nombre` = s.`nombre`
WHERE pi.`nombre` IS NULL;

ALTER TABLE `Pago` ADD COLUMN `sesionTrabajoId` VARCHAR(191) NULL;

CREATE TABLE `PedidoEstadoHistorial` (
  `id` VARCHAR(191) NOT NULL,
  `pedidoId` VARCHAR(191) NOT NULL,
  `usuarioId` VARCHAR(191) NULL,
  `estadoAnterior` ENUM('RECIBIDO', 'EN_PROCESO', 'LISTO', 'ENTREGADO', 'CANCELADO') NULL,
  `estadoNuevo` ENUM('RECIBIDO', 'EN_PROCESO', 'LISTO', 'ENTREGADO', 'CANCELADO') NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SesionTrabajo` (
  `id` VARCHAR(191) NOT NULL,
  `usuarioId` VARCHAR(191) NOT NULL,
  `fechaInicio` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `fechaFin` DATETIME(3) NULL,
  `estado` ENUM('ABIERTA', 'CERRADA') NOT NULL DEFAULT 'ABIERTA',
  `totalPedidos` INTEGER NOT NULL DEFAULT 0,
  `totalPagado` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  `observaciones` TEXT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Cliente_creadoPorId_idx` ON `Cliente`(`creadoPorId`);
CREATE INDEX `Pedido_usuarioId_idx` ON `Pedido`(`usuarioId`);
CREATE INDEX `Pedido_sesionTrabajoId_idx` ON `Pedido`(`sesionTrabajoId`);
CREATE INDEX `Pedido_eliminadoPorId_idx` ON `Pedido`(`eliminadoPorId`);
CREATE INDEX `Pago_sesionTrabajoId_idx` ON `Pago`(`sesionTrabajoId`);
CREATE INDEX `PedidoEstadoHistorial_pedidoId_idx` ON `PedidoEstadoHistorial`(`pedidoId`);
CREATE INDEX `PedidoEstadoHistorial_usuarioId_idx` ON `PedidoEstadoHistorial`(`usuarioId`);
CREATE INDEX `PedidoEstadoHistorial_createdAt_idx` ON `PedidoEstadoHistorial`(`createdAt`);
CREATE INDEX `SesionTrabajo_usuarioId_estado_idx` ON `SesionTrabajo`(`usuarioId`, `estado`);
CREATE INDEX `SesionTrabajo_fechaInicio_idx` ON `SesionTrabajo`(`fechaInicio`);

ALTER TABLE `Cliente`
  ADD CONSTRAINT `Cliente_creadoPorId_fkey`
  FOREIGN KEY (`creadoPorId`) REFERENCES `Usuario`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Pedido`
  ADD CONSTRAINT `Pedido_sesionTrabajoId_fkey`
  FOREIGN KEY (`sesionTrabajoId`) REFERENCES `SesionTrabajo`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Pedido`
  ADD CONSTRAINT `Pedido_eliminadoPorId_fkey`
  FOREIGN KEY (`eliminadoPorId`) REFERENCES `Usuario`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Pago`
  ADD CONSTRAINT `Pago_sesionTrabajoId_fkey`
  FOREIGN KEY (`sesionTrabajoId`) REFERENCES `SesionTrabajo`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `PedidoEstadoHistorial`
  ADD CONSTRAINT `PedidoEstadoHistorial_pedidoId_fkey`
  FOREIGN KEY (`pedidoId`) REFERENCES `Pedido`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PedidoEstadoHistorial`
  ADD CONSTRAINT `PedidoEstadoHistorial_usuarioId_fkey`
  FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `SesionTrabajo`
  ADD CONSTRAINT `SesionTrabajo_usuarioId_fkey`
  FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
