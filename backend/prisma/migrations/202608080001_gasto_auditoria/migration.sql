-- Auditoría de ediciones y anulaciones de gastos.
--
-- Hace falta para la línea de tiempo de Usuarios: el alta del gasto ya es
-- auditable con `Gasto.creadoPorId` + `Gasto.fecha`, pero una EDICIÓN solo
-- dejaba `updatedAt` (sin el valor anterior) y una ANULACIÓN solo `deletedAt`
-- (sin el motivo). Esta tabla guarda justamente eso.
--
-- 100% ADITIVA e idempotente: crea una tabla nueva, no toca ninguna existente,
-- no borra ni reescribe datos. Los gastos ya registrados siguen apareciendo en
-- la línea de tiempo como "gasto creado" sin necesidad de backfill.

CREATE TABLE IF NOT EXISTS `GastoAuditoria` (
  `id`              VARCHAR(191) NOT NULL,
  `gastoId`         VARCHAR(191) NOT NULL,
  `usuarioId`       VARCHAR(191) NULL,
  `accion`          VARCHAR(20)  NOT NULL,
  `motivo`          TEXT         NULL,
  `valorAntes`      DECIMAL(10,2) NULL,
  `valorDespues`    DECIMAL(10,2) NULL,
  `snapshotAntes`   TEXT         NULL,
  `snapshotDespues` TEXT         NULL,
  `createdAt`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS lavasuit_add_index_if_missing;
DELIMITER //
CREATE PROCEDURE lavasuit_add_index_if_missing(
  IN tname VARCHAR(64), IN iname VARCHAR(64), IN icols VARCHAR(255)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tname AND INDEX_NAME = iname
  ) THEN
    SET @sql = CONCAT('CREATE INDEX `', iname, '` ON `', tname, '`(', icols, ')');
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

CALL lavasuit_add_index_if_missing('GastoAuditoria', 'GastoAuditoria_gastoId_idx',   '`gastoId`');
CALL lavasuit_add_index_if_missing('GastoAuditoria', 'GastoAuditoria_usuarioId_idx', '`usuarioId`');
CALL lavasuit_add_index_if_missing('GastoAuditoria', 'GastoAuditoria_createdAt_idx', '`createdAt`');

SET @fkGasto := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'GastoAuditoria'
     AND CONSTRAINT_NAME = 'GastoAuditoria_gastoId_fkey'
);
SET @sql := IF(@fkGasto = 0,
  'ALTER TABLE `GastoAuditoria` ADD CONSTRAINT `GastoAuditoria_gastoId_fkey` FOREIGN KEY (`gastoId`) REFERENCES `Gasto`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fkUsuario := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'GastoAuditoria'
     AND CONSTRAINT_NAME = 'GastoAuditoria_usuarioId_fkey'
);
SET @sql := IF(@fkUsuario = 0,
  'ALTER TABLE `GastoAuditoria` ADD CONSTRAINT `GastoAuditoria_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP PROCEDURE IF EXISTS lavasuit_add_index_if_missing;
