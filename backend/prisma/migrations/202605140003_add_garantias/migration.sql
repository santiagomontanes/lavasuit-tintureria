-- CreateTable
CREATE TABLE `Garantia` (
  `id` VARCHAR(191) NOT NULL,
  `pedidoId` VARCHAR(191) NOT NULL,
  `pedidoItemId` VARCHAR(191) NULL,
  `usuarioId` VARCHAR(191) NOT NULL,
  `sesionTrabajoId` VARCHAR(191) NULL,
  `descripcion` TEXT NOT NULL,
  `fotoUrl` VARCHAR(255) NOT NULL,
  `fotoPath` VARCHAR(255) NOT NULL,
  `estado` ENUM('ABIERTA', 'EN_REVISION', 'RESUELTA', 'RECHAZADA') NOT NULL DEFAULT 'ABIERTA',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Garantia_pedidoId_idx` ON `Garantia`(`pedidoId`);
CREATE INDEX `Garantia_pedidoItemId_idx` ON `Garantia`(`pedidoItemId`);
CREATE INDEX `Garantia_usuarioId_idx` ON `Garantia`(`usuarioId`);
CREATE INDEX `Garantia_sesionTrabajoId_idx` ON `Garantia`(`sesionTrabajoId`);
CREATE INDEX `Garantia_estado_idx` ON `Garantia`(`estado`);
CREATE INDEX `Garantia_createdAt_idx` ON `Garantia`(`createdAt`);

-- AddForeignKey
ALTER TABLE `Garantia` ADD CONSTRAINT `Garantia_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `Pedido`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Garantia` ADD CONSTRAINT `Garantia_pedidoItemId_fkey` FOREIGN KEY (`pedidoItemId`) REFERENCES `PedidoItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Garantia` ADD CONSTRAINT `Garantia_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Garantia` ADD CONSTRAINT `Garantia_sesionTrabajoId_fkey` FOREIGN KEY (`sesionTrabajoId`) REFERENCES `SesionTrabajo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
