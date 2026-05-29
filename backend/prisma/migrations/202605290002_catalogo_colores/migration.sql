-- Catálogo administrable de colores para tintorería/lavandería.
-- Aditivo e idempotente: misma técnica que migraciones previas.

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

-- ── Color (tabla nueva) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `Color` (
  `id`               VARCHAR(191) NOT NULL,
  `nombre`           VARCHAR(60)  NOT NULL,
  `codigo`           VARCHAR(30)  NULL,
  `hex`              VARCHAR(9)   NULL,
  `activo`           BOOLEAN      NOT NULL DEFAULT TRUE,
  `creadoPorId`      VARCHAR(191) NULL,
  `actualizadoPorId` VARCHAR(191) NULL,
  `createdAt`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`        DATETIME(3)  NOT NULL,
  `deletedAt`        DATETIME(3)  NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL lavasuit_add_index_if_missing('Color', 'Color_activo_idx',    '`activo`');
CALL lavasuit_add_index_if_missing('Color', 'Color_deletedAt_idx', '`deletedAt`');
CALL lavasuit_add_index_if_missing('Color', 'Color_codigo_idx',    '`codigo`');

-- FKs Color → Usuario (sólo si no existen)
SET @fkExists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Color'
     AND CONSTRAINT_NAME = 'Color_creadoPorId_fkey'
);
SET @sql := IF(@fkExists = 0,
  'ALTER TABLE `Color` ADD CONSTRAINT `Color_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fkExists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Color'
     AND CONSTRAINT_NAME = 'Color_actualizadoPorId_fkey'
);
SET @sql := IF(@fkExists = 0,
  'ALTER TABLE `Color` ADD CONSTRAINT `Color_actualizadoPorId_fkey` FOREIGN KEY (`actualizadoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP PROCEDURE IF EXISTS lavasuit_add_index_if_missing;

-- Semilla inicial de colores comunes (idempotente por nombre).
INSERT INTO `Color` (`id`, `nombre`, `updatedAt`)
SELECT UUID(), n.nombre, NOW(3)
  FROM (
    SELECT 'Negro'  AS nombre UNION ALL
    SELECT 'Blanco' UNION ALL
    SELECT 'Azul'   UNION ALL
    SELECT 'Rojo'   UNION ALL
    SELECT 'Gris'   UNION ALL
    SELECT 'Verde'  UNION ALL
    SELECT 'Beige'  UNION ALL
    SELECT 'Cafe'
  ) AS n
 WHERE NOT EXISTS (
   SELECT 1 FROM `Color` c WHERE c.nombre = n.nombre AND c.deletedAt IS NULL
 );
