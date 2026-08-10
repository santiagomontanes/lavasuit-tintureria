-- Puntos 2 y 5: el gasto pertenece a la sesión de caja en que se registró, y
-- clave administrativa para cerrar caja offline (Configuracion). 100% aditivo
-- e idempotente: no borra datos, no toca pagos/caja/pedidos existentes.

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

-- ── Gasto: vínculo con la sesión de caja ────────────────────────────────────
CALL lavasuit_add_column_if_missing('Gasto', 'cajaSesionId', 'VARCHAR(191) NULL');
CALL lavasuit_add_index_if_missing('Gasto', 'Gasto_cajaSesionId_idx', '`cajaSesionId`');

-- FK Gasto.cajaSesionId → CajaSesion.id, sólo si no existe.
SET @fkExists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Gasto'
     AND CONSTRAINT_NAME = 'Gasto_cajaSesionId_fkey'
);
SET @sql := IF(@fkExists = 0,
  'ALTER TABLE `Gasto` ADD CONSTRAINT `Gasto_cajaSesionId_fkey` FOREIGN KEY (`cajaSesionId`) REFERENCES `CajaSesion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── ConfiguracionEmpresa: clave para cerrar caja offline ────────────────────
CALL lavasuit_add_column_if_missing('ConfiguracionEmpresa', 'claveCajaOffline', 'VARCHAR(120) NULL');

DROP PROCEDURE IF EXISTS lavasuit_add_column_if_missing;
DROP PROCEDURE IF EXISTS lavasuit_add_index_if_missing;
