-- Marca del último "Restablecer operación".
--
-- Cuando el administrador restablece la operación, el borrado en el servidor no
-- basta: cada celular tiene su propia base SQLite con pedidos, pagos, gastos y
-- caja, y una cola de sincronización pendiente. Si no se enteran del reset,
-- vuelven a subir lo que se acaba de borrar.
--
-- Esta columna es la señal: el servidor la actualiza al restablecer y cada
-- dispositivo, al leer la configuración de empresa, compara con la última que
-- aplicó. Si la del servidor es más nueva, vacía su copia local.
--
-- 100% ADITIVA: una columna nullable. NULL = nunca se ha restablecido, que es
-- el estado correcto para una instalación existente (nadie borra nada al
-- actualizar).

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

CALL lavasuit_add_column_if_missing('ConfiguracionEmpresa', 'operacionResetAt', 'DATETIME(3) NULL');

DROP PROCEDURE IF EXISTS lavasuit_add_column_if_missing;
