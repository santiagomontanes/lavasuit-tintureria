-- Punto 2 (encargadoEntrega) + Punto 9 (consolidación de deuda anterior).
-- 100% aditivo e idempotente: no borra datos, no toca pagos/caja/historial.
-- Las facturas viejas conservan su `total` y sus pagos; sólo se marca la
-- migración de su saldo mediante `consolidadoEnPedidoId`.

DROP PROCEDURE IF EXISTS lavasuit_add_column_if_missing;
DROP PROCEDURE IF EXISTS lavasuit_add_index_if_missing;
DELIMITER //

CREATE PROCEDURE lavasuit_add_column_if_missing(
  IN tname VARCHAR(64),
  IN cname VARCHAR(64),
  IN cdef  VARCHAR(255)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = tname
       AND COLUMN_NAME  = cname
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', tname, '` ADD COLUMN `', cname, '` ', cdef);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //

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

-- ── Pedido: columnas nuevas ─────────────────────────────────────────────
CALL lavasuit_add_column_if_missing('Pedido', 'encargadoEntrega',      'VARCHAR(120) NULL');
CALL lavasuit_add_column_if_missing('Pedido', 'deudaConsolidada',      'DECIMAL(10,2) NOT NULL DEFAULT 0');
CALL lavasuit_add_column_if_missing('Pedido', 'consolidadoEnPedidoId', 'VARCHAR(191) NULL');

CALL lavasuit_add_index_if_missing('Pedido', 'Pedido_consolidadoEnPedidoId_idx', '`consolidadoEnPedidoId`');

-- FK Pedido.consolidadoEnPedidoId → Pedido.id (self), sólo si no existe.
SET @fkExists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Pedido'
     AND CONSTRAINT_NAME = 'Pedido_consolidadoEnPedidoId_fkey'
);
SET @sql := IF(@fkExists = 0,
  'ALTER TABLE `Pedido` ADD CONSTRAINT `Pedido_consolidadoEnPedidoId_fkey` FOREIGN KEY (`consolidadoEnPedidoId`) REFERENCES `Pedido`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── ConsolidacionDeuda (tabla nueva) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ConsolidacionDeuda` (
  `id`               VARCHAR(191) NOT NULL,
  `pedidoDestinoId`  VARCHAR(191) NOT NULL,
  `pedidoOrigenId`   VARCHAR(191) NOT NULL,
  `montoConsolidado` DECIMAL(10,2) NOT NULL,
  `usuarioId`        VARCHAR(191) NULL,
  `motivo`           TEXT         NOT NULL,
  `revertidoEn`      DATETIME(3)  NULL,
  `revertidoPorId`   VARCHAR(191) NULL,
  `createdAt`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL lavasuit_add_index_if_missing('ConsolidacionDeuda', 'ConsolidacionDeuda_pedidoDestinoId_idx', '`pedidoDestinoId`');
CALL lavasuit_add_index_if_missing('ConsolidacionDeuda', 'ConsolidacionDeuda_pedidoOrigenId_idx',  '`pedidoOrigenId`');
CALL lavasuit_add_index_if_missing('ConsolidacionDeuda', 'ConsolidacionDeuda_usuarioId_idx',       '`usuarioId`');
CALL lavasuit_add_index_if_missing('ConsolidacionDeuda', 'ConsolidacionDeuda_revertidoEn_idx',     '`revertidoEn`');
CALL lavasuit_add_index_if_missing('ConsolidacionDeuda', 'ConsolidacionDeuda_createdAt_idx',       '`createdAt`');

-- FKs ConsolidacionDeuda (sólo si no existen)
SET @fkExists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'ConsolidacionDeuda'
     AND CONSTRAINT_NAME = 'ConsolidacionDeuda_pedidoDestinoId_fkey');
SET @sql := IF(@fkExists = 0,
  'ALTER TABLE `ConsolidacionDeuda` ADD CONSTRAINT `ConsolidacionDeuda_pedidoDestinoId_fkey` FOREIGN KEY (`pedidoDestinoId`) REFERENCES `Pedido`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fkExists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'ConsolidacionDeuda'
     AND CONSTRAINT_NAME = 'ConsolidacionDeuda_pedidoOrigenId_fkey');
SET @sql := IF(@fkExists = 0,
  'ALTER TABLE `ConsolidacionDeuda` ADD CONSTRAINT `ConsolidacionDeuda_pedidoOrigenId_fkey` FOREIGN KEY (`pedidoOrigenId`) REFERENCES `Pedido`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fkExists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'ConsolidacionDeuda'
     AND CONSTRAINT_NAME = 'ConsolidacionDeuda_usuarioId_fkey');
SET @sql := IF(@fkExists = 0,
  'ALTER TABLE `ConsolidacionDeuda` ADD CONSTRAINT `ConsolidacionDeuda_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fkExists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'ConsolidacionDeuda'
     AND CONSTRAINT_NAME = 'ConsolidacionDeuda_revertidoPorId_fkey');
SET @sql := IF(@fkExists = 0,
  'ALTER TABLE `ConsolidacionDeuda` ADD CONSTRAINT `ConsolidacionDeuda_revertidoPorId_fkey` FOREIGN KEY (`revertidoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP PROCEDURE IF EXISTS lavasuit_add_column_if_missing;
DROP PROCEDURE IF EXISTS lavasuit_add_index_if_missing;
