-- AlterTable: campos de orden de recorrido y asignación por empleado
ALTER TABLE `Cliente`
  ADD COLUMN `identificador` VARCHAR(40) NULL,
  ADD COLUMN `ordenBase` INTEGER NULL,
  ADD COLUMN `subOrden` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `sortKey` VARCHAR(40) NULL,
  ADD COLUMN `asignadoAId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Cliente_ordenBase_subOrden_key` ON `Cliente`(`ordenBase`, `subOrden`);
CREATE INDEX `Cliente_asignadoAId_idx` ON `Cliente`(`asignadoAId`);
CREATE INDEX `Cliente_sortKey_idx` ON `Cliente`(`sortKey`);

-- AddForeignKey
ALTER TABLE `Cliente` ADD CONSTRAINT `Cliente_asignadoAId_fkey` FOREIGN KEY (`asignadoAId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
