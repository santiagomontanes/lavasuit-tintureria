-- Módulo de Gastos para contabilidad básica del negocio.
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

-- ── Gasto (tabla nueva) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `Gasto` (
  `id`               VARCHAR(191) NOT NULL,
  `fecha`            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `concepto`         VARCHAR(150) NOT NULL,
  `categoria`        VARCHAR(60)  NOT NULL,
  `valor`            DECIMAL(10,2) NOT NULL,
  `metodoPago`       ENUM('EFECTIVO','NEQUI','DAVIPLATA','TRANSFERENCIA','TARJETA','YAPE','PLIN','OTRO') NULL,
  `descripcion`      TEXT         NULL,
  `creadoPorId`      VARCHAR(191) NULL,
  `actualizadoPorId` VARCHAR(191) NULL,
  `createdAt`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`        DATETIME(3)  NOT NULL,
  `deletedAt`        DATETIME(3)  NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL lavasuit_add_index_if_missing('Gasto', 'Gasto_fecha_idx',       '`fecha`');
CALL lavasuit_add_index_if_missing('Gasto', 'Gasto_categoria_idx',   '`categoria`');
CALL lavasuit_add_index_if_missing('Gasto', 'Gasto_creadoPorId_idx', '`creadoPorId`');
CALL lavasuit_add_index_if_missing('Gasto', 'Gasto_deletedAt_idx',   '`deletedAt`');

-- FKs Gasto → Usuario (sólo si no existen)
SET @fkExists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Gasto'
     AND CONSTRAINT_NAME = 'Gasto_creadoPorId_fkey'
);
SET @sql := IF(@fkExists = 0,
  'ALTER TABLE `Gasto` ADD CONSTRAINT `Gasto_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fkExists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Gasto'
     AND CONSTRAINT_NAME = 'Gasto_actualizadoPorId_fkey'
);
SET @sql := IF(@fkExists = 0,
  'ALTER TABLE `Gasto` ADD CONSTRAINT `Gasto_actualizadoPorId_fkey` FOREIGN KEY (`actualizadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP PROCEDURE IF EXISTS lavasuit_add_index_if_missing;
