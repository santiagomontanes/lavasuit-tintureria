-- Opciones Avanzadas de Operación + auditoría de configuración.
-- 100% aditivo e idempotente. Defaults = comportamiento actual (no rompe nada).

DROP PROCEDURE IF EXISTS lavasuit_add_column_if_missing;
DROP PROCEDURE IF EXISTS lavasuit_add_index_if_missing;
DELIMITER //

CREATE PROCEDURE lavasuit_add_column_if_missing(
  IN tname VARCHAR(64), IN cname VARCHAR(64), IN cdef VARCHAR(255)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tname AND COLUMN_NAME = cname
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', tname, '` ADD COLUMN `', cname, '` ', cdef);
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END //

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

-- ── ConfiguracionEmpresa: flags + password ──────────────────────────────
CALL lavasuit_add_column_if_missing('ConfiguracionEmpresa', 'mostrarNombreEnRecibo',  'BOOLEAN NOT NULL DEFAULT TRUE');
CALL lavasuit_add_column_if_missing('ConfiguracionEmpresa', 'descontarGastosDeCaja',  'BOOLEAN NOT NULL DEFAULT TRUE');
CALL lavasuit_add_column_if_missing('ConfiguracionEmpresa', 'exigirFotoCambioEstado', 'BOOLEAN NOT NULL DEFAULT TRUE');
CALL lavasuit_add_column_if_missing('ConfiguracionEmpresa', 'exigirFotoEntrega',      'BOOLEAN NOT NULL DEFAULT FALSE');
CALL lavasuit_add_column_if_missing('ConfiguracionEmpresa', 'solicitarMontoRecibido', 'BOOLEAN NOT NULL DEFAULT TRUE');
CALL lavasuit_add_column_if_missing('ConfiguracionEmpresa', 'configPasswordHash',     'VARCHAR(255) NULL');

-- ── ConfiguracionAuditoria (tabla nueva) ────────────────────────────────
CREATE TABLE IF NOT EXISTS `ConfiguracionAuditoria` (
  `id`            VARCHAR(191) NOT NULL,
  `usuarioId`     VARCHAR(191) NULL,
  `campo`         VARCHAR(80)  NOT NULL,
  `etiqueta`      VARCHAR(150) NULL,
  `valorAnterior` VARCHAR(255) NULL,
  `valorNuevo`    VARCHAR(255) NULL,
  `createdAt`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL lavasuit_add_index_if_missing('ConfiguracionAuditoria', 'ConfiguracionAuditoria_usuarioId_idx', '`usuarioId`');
CALL lavasuit_add_index_if_missing('ConfiguracionAuditoria', 'ConfiguracionAuditoria_createdAt_idx', '`createdAt`');

SET @fkExists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'ConfiguracionAuditoria'
     AND CONSTRAINT_NAME = 'ConfiguracionAuditoria_usuarioId_fkey');
SET @sql := IF(@fkExists = 0,
  'ALTER TABLE `ConfiguracionAuditoria` ADD CONSTRAINT `ConfiguracionAuditoria_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP PROCEDURE IF EXISTS lavasuit_add_column_if_missing;
DROP PROCEDURE IF EXISTS lavasuit_add_index_if_missing;
