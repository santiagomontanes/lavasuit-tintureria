-- Bug caja (cierre distinto Mobile/Desktop): el Pago no tenía vínculo con la
-- sesión de caja (solo sesionTrabajoId, que es 1:N con CajaSesion). El backend
-- calculaba el arqueo filtrando pagos por FECHA [apertura, ahora] + usuario,
-- mientras que Mobile filtra ESTRICTO por cajaSesionId. Criterios distintos →
-- distinto totalEfectivo → distinto efectivoEsperado/diferencia.
--
-- Este migration agrega Pago.cajaSesionId (mismo patrón que Gasto.cajaSesionId)
-- y hace un backfill best-effort emparejando cada pago con la sesión de caja de
-- su usuario cuyo rango [fechaApertura, fechaCierre|ahora] contiene el createdAt
-- del pago. 100% aditivo e idempotente: no borra datos.

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

-- ── Pago: vínculo con la sesión de caja ─────────────────────────────────────
CALL lavasuit_add_column_if_missing('Pago', 'cajaSesionId', 'VARCHAR(191) NULL');
CALL lavasuit_add_index_if_missing('Pago', 'Pago_cajaSesionId_idx', '`cajaSesionId`');

-- FK Pago.cajaSesionId → CajaSesion.id, sólo si no existe.
SET @fkExists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Pago'
     AND CONSTRAINT_NAME = 'Pago_cajaSesionId_fkey'
);
SET @sql := IF(@fkExists = 0,
  'ALTER TABLE `Pago` ADD CONSTRAINT `Pago_cajaSesionId_fkey` FOREIGN KEY (`cajaSesionId`) REFERENCES `CajaSesion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Backfill best-effort ────────────────────────────────────────────────────
-- Para cada pago sin cajaSesionId, tomar la sesión de caja de SU usuario cuya
-- ventana [fechaApertura, fechaCierre|NOW] contiene el createdAt del pago. Si
-- varias coinciden (no debería pasar en un mismo usuario), se toma la de
-- apertura más reciente <= createdAt. Los pagos que no emparejen quedan en NULL
-- (excluidos del arqueo bajo el filtro ESTRICTO, comportamiento elegido).
UPDATE `Pago` p
SET p.`cajaSesionId` = (
  SELECT c.`id`
    FROM `CajaSesion` c
   WHERE c.`usuarioId` = p.`usuarioId`
     AND c.`fechaApertura` <= p.`createdAt`
     AND (c.`fechaCierre` IS NULL OR p.`createdAt` <= c.`fechaCierre`)
   ORDER BY c.`fechaApertura` DESC
   LIMIT 1
)
WHERE p.`cajaSesionId` IS NULL
  AND p.`usuarioId` IS NOT NULL;

DROP PROCEDURE IF EXISTS lavasuit_add_column_if_missing;
DROP PROCEDURE IF EXISTS lavasuit_add_index_if_missing;
