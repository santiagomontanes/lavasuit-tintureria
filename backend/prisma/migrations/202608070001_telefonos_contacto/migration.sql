-- Teléfonos del bloque CONTACTO del recibo térmico.
--
-- `ConfiguracionEmpresa.telefono` es VarChar(40) y representa UN teléfono del
-- negocio; el recibo necesita una LISTA (tres números no caben cómodos en 40
-- caracteres). Se agrega un campo propio de tipo TEXT.
--
-- 100% ADITIVA e idempotente: solo agrega una columna nullable. No borra ni
-- reescribe nada. Las lavanderías que ya tengan números en `telefono` los
-- siguen viendo: el recibo usa `telefonosContacto` y, si está vacío, `telefono`.

DROP PROCEDURE IF EXISTS lavasuit_add_column_if_missing;
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
DELIMITER ;

CALL lavasuit_add_column_if_missing('ConfiguracionEmpresa', 'telefonosContacto', 'TEXT NULL');

-- Arranque cómodo: si ya había un teléfono configurado, se copia como primer
-- número de contacto. Solo cuando el campo nuevo está vacío.
UPDATE `ConfiguracionEmpresa`
   SET `telefonosContacto` = `telefono`
 WHERE `telefonosContacto` IS NULL
   AND `telefono` IS NOT NULL
   AND TRIM(`telefono`) <> '';

DROP PROCEDURE IF EXISTS lavasuit_add_column_if_missing;
