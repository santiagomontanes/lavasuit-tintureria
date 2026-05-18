ALTER TABLE `Pago` ADD COLUMN `usuarioId` VARCHAR(191) NULL;

UPDATE `Pago` p
INNER JOIN `Pedido` pe ON pe.`id` = p.`pedidoId`
SET p.`usuarioId` = pe.`usuarioId`
WHERE p.`usuarioId` IS NULL;

CREATE INDEX `Pago_usuarioId_idx` ON `Pago`(`usuarioId`);

ALTER TABLE `Pago`
ADD CONSTRAINT `Pago_usuarioId_fkey`
FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`)
ON DELETE SET NULL ON UPDATE CASCADE;
