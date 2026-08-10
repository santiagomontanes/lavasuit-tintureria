-- Auditoria adicional de cambios de estado/entrega.
-- Aditivo e idempotente: no borra datos y conserva historial existente.

DROP PROCEDURE IF EXISTS lavasuit_add_column_if_missing;
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
DELIMITER ;

CALL lavasuit_add_column_if_missing('PedidoEstadoHistorial', 'accion',      'VARCHAR(40) NULL');
CALL lavasuit_add_column_if_missing('PedidoEstadoHistorial', 'observacion', 'TEXT NULL');
CALL lavasuit_add_column_if_missing('PedidoEstadoHistorial', 'conFoto',     'BOOLEAN NOT NULL DEFAULT FALSE');

DROP PROCEDURE IF EXISTS lavasuit_add_column_if_missing;
