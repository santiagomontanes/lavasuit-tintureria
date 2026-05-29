-- Snapshot de marca por item de pedido para impresión y reportes.
-- Aditivo e idempotente. marcaId es referencia débil (no FK) para evitar
-- romper pedidos existentes si la marca se renombra/borra.

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

CALL lavasuit_add_col_if_missing('PedidoItem', 'marcaId',     'VARCHAR(191) NULL');
CALL lavasuit_add_col_if_missing('PedidoItem', 'marcaNombre', 'VARCHAR(100) NULL');
CALL lavasuit_add_col_if_missing('PedidoItem', 'marcaCodigo', 'VARCHAR(30)  NULL');

CALL lavasuit_add_index_if_missing('PedidoItem', 'PedidoItem_marcaId_idx', '`marcaId`');

DROP PROCEDURE IF EXISTS lavasuit_add_col_if_missing;
DROP PROCEDURE IF EXISTS lavasuit_add_index_if_missing;
