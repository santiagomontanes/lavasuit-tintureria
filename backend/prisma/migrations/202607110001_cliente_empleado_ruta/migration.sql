-- #Rutas M2M: un cliente puede estar asignado a VARIOS empleados a la vez.
-- Tabla intermedia aditiva `ClienteEmpleadoRuta`. NO borra ni reemplaza datos.
-- `Cliente.asignadoAId` se conserva por compatibilidad. Idempotente: se puede
-- correr varias veces sin error (misma técnica que migraciones previas).

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

-- ── Tabla intermedia ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ClienteEmpleadoRuta` (
  `id`        VARCHAR(191) NOT NULL,
  `clienteId` VARCHAR(191) NOT NULL,
  `usuarioId` VARCHAR(191) NOT NULL,
  `orden`     INT          NULL,
  `subOrden`  INT          NOT NULL DEFAULT 0,
  `activo`    BOOLEAN      NOT NULL DEFAULT true,
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ClienteEmpleadoRuta_clienteId_usuarioId_key` (`clienteId`, `usuarioId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL lavasuit_add_index_if_missing('ClienteEmpleadoRuta', 'ClienteEmpleadoRuta_usuarioId_idx', '`usuarioId`');
CALL lavasuit_add_index_if_missing('ClienteEmpleadoRuta', 'ClienteEmpleadoRuta_clienteId_idx', '`clienteId`');

-- FKs (sólo si no existen)
SET @fkExists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'ClienteEmpleadoRuta'
     AND CONSTRAINT_NAME = 'ClienteEmpleadoRuta_clienteId_fkey'
);
SET @sql := IF(@fkExists = 0,
  'ALTER TABLE `ClienteEmpleadoRuta` ADD CONSTRAINT `ClienteEmpleadoRuta_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `Cliente`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fkExists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'ClienteEmpleadoRuta'
     AND CONSTRAINT_NAME = 'ClienteEmpleadoRuta_usuarioId_fkey'
);
SET @sql := IF(@fkExists = 0,
  'ALTER TABLE `ClienteEmpleadoRuta` ADD CONSTRAINT `ClienteEmpleadoRuta_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP PROCEDURE IF EXISTS lavasuit_add_index_if_missing;

-- ── Backfill: migrar la asignación única existente al M2M ────────────
-- Cada Cliente con asignadoAId genera su fila en la tabla intermedia.
-- INSERT IGNORE + la UNIQUE(clienteId,usuarioId) => idempotente (no duplica).
INSERT IGNORE INTO `ClienteEmpleadoRuta`
  (`id`, `clienteId`, `usuarioId`, `orden`, `subOrden`, `activo`, `createdAt`, `updatedAt`)
SELECT UUID(), c.`id`, c.`asignadoAId`, c.`ordenBase`, c.`subOrden`, c.`activo`, NOW(3), NOW(3)
  FROM `Cliente` c
 WHERE c.`asignadoAId` IS NOT NULL;
