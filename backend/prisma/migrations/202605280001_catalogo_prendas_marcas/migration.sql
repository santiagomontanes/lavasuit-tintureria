-- Catálogo de prendas y marcas para autocomplete tipo POS + importación Excel.
-- Aditivo, idempotente: ALTER ... ADD COLUMN IF NOT EXISTS no existe en
-- MySQL < 8.0.29, así que envolvemos cada DDL en un PROCEDURE temporal.

DROP PROCEDURE IF EXISTS lavasuit_add_col_if_missing;
DELIMITER //
CREATE PROCEDURE lavasuit_add_col_if_missing(
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
DELIMITER ;

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

-- ── Marca (tabla nueva) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `Marca` (
  `id`               VARCHAR(191) NOT NULL,
  `nombre`           VARCHAR(100) NOT NULL,
  `codigo`           VARCHAR(30)  NULL,
  `abreviaturas`     VARCHAR(255) NULL,
  `activo`           BOOLEAN      NOT NULL DEFAULT TRUE,
  `creadoPorId`      VARCHAR(191) NULL,
  `actualizadoPorId` VARCHAR(191) NULL,
  `createdAt`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`        DATETIME(3)  NOT NULL,
  `deletedAt`        DATETIME(3)  NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL lavasuit_add_index_if_missing('Marca', 'Marca_activo_idx',    '`activo`');
CALL lavasuit_add_index_if_missing('Marca', 'Marca_deletedAt_idx', '`deletedAt`');
CALL lavasuit_add_index_if_missing('Marca', 'Marca_codigo_idx',    '`codigo`');

-- FKs Marca → Usuario (sólo si no existen)
SET @fkExists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Marca'
     AND CONSTRAINT_NAME = 'Marca_creadoPorId_fkey'
);
SET @sql := IF(@fkExists = 0,
  'ALTER TABLE `Marca` ADD CONSTRAINT `Marca_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fkExists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Marca'
     AND CONSTRAINT_NAME = 'Marca_actualizadoPorId_fkey'
);
SET @sql := IF(@fkExists = 0,
  'ALTER TABLE `Marca` ADD CONSTRAINT `Marca_actualizadoPorId_fkey` FOREIGN KEY (`actualizadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Servicio (nuevas columnas) ──────────────────────────────────────
CALL lavasuit_add_col_if_missing('Servicio', 'codigo',       'VARCHAR(30)  NULL');
CALL lavasuit_add_col_if_missing('Servicio', 'abreviaturas', 'VARCHAR(255) NULL');
CALL lavasuit_add_col_if_missing('Servicio', 'marcaId',      'VARCHAR(191) NULL');

CALL lavasuit_add_index_if_missing('Servicio', 'Servicio_codigo_idx',  '`codigo`');
CALL lavasuit_add_index_if_missing('Servicio', 'Servicio_marcaId_idx', '`marcaId`');

SET @fkExists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Servicio'
     AND CONSTRAINT_NAME = 'Servicio_marcaId_fkey'
);
SET @sql := IF(@fkExists = 0,
  'ALTER TABLE `Servicio` ADD CONSTRAINT `Servicio_marcaId_fkey` FOREIGN KEY (`marcaId`) REFERENCES `Marca`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP PROCEDURE IF EXISTS lavasuit_add_col_if_missing;
DROP PROCEDURE IF EXISTS lavasuit_add_index_if_missing;
