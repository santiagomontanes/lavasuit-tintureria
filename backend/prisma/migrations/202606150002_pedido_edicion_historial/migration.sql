-- Auditoría de ediciones de órdenes (motivo + snapshots antes/después).
-- Aditivo e idempotente: misma técnica que migraciones previas. No borra datos.

DROP PROCEDURE IF EXISTS lavasuit_add_index_if_missing;
DELIMITER //
CREATE PROCEDURE lavasuit_add_index_if_missing(
  IN tname VARCHAR(64),
  IN iname VARCHAR(64),
  IN icols VARCHAR(255)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = tname
       AND INDEX_NAME   = iname
  ) THEN
    SET @sql = CONCAT('CREATE INDEX `', iname, '` ON `', tname, '`(', icols, ')');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

CREATE TABLE IF NOT EXISTS `PedidoEdicionHistorial` (
  `id`                  VARCHAR(191) NOT NULL,
  `pedidoId`            VARCHAR(191) NOT NULL,
  `usuarioId`           VARCHAR(191) NULL,
  `motivo`              TEXT         NOT NULL,
  `cambiosJson`         LONGTEXT     NULL,
  `snapshotAntesJson`   LONGTEXT     NOT NULL,
  `snapshotDespuesJson` LONGTEXT     NOT NULL,
  `totalAntes`          DECIMAL(10,2) NOT NULL,
  `totalDespues`        DECIMAL(10,2) NOT NULL,
  `createdAt`           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL lavasuit_add_index_if_missing('PedidoEdicionHistorial', 'PedidoEdicionHistorial_pedidoId_idx',  '`pedidoId`');
CALL lavasuit_add_index_if_missing('PedidoEdicionHistorial', 'PedidoEdicionHistorial_usuarioId_idx', '`usuarioId`');
CALL lavasuit_add_index_if_missing('PedidoEdicionHistorial', 'PedidoEdicionHistorial_createdAt_idx', '`createdAt`');

-- FKs (sólo si no existen)
SET @fkExists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'PedidoEdicionHistorial'
     AND CONSTRAINT_NAME = 'PedidoEdicionHistorial_pedidoId_fkey'
);
SET @sql := IF(@fkExists = 0,
  'ALTER TABLE `PedidoEdicionHistorial` ADD CONSTRAINT `PedidoEdicionHistorial_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `Pedido`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fkExists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'PedidoEdicionHistorial'
     AND CONSTRAINT_NAME = 'PedidoEdicionHistorial_usuarioId_fkey'
);
SET @sql := IF(@fkExists = 0,
  'ALTER TABLE `PedidoEdicionHistorial` ADD CONSTRAINT `PedidoEdicionHistorial_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP PROCEDURE IF EXISTS lavasuit_add_index_if_missing;
