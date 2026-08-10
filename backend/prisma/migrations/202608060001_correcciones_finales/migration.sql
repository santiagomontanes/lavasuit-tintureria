-- Correcciones finales (ago-2026). 100% ADITIVA e idempotente:
-- solo agrega columnas nullable, una tabla nueva e índices. No borra ni
-- reescribe información existente. Se puede aplicar sobre una base en uso.
--
--  1) PedidoEstadoHistorial.origen  → distingue el cambio de estado hecho por
--     una persona del que dispara solo el sistema al registrar un abono
--     (auto-entrega). La fila se CONSERVA como evidencia; solo deja de listarse
--     como movimiento del empleado.
--  2) CajaSesion.totalNequi / totalDaviplata / totalGastos / totalGastosEfectivo
--     / denominacionesJson → el snapshot del cierre guardaba Nequi y Daviplata
--     mezclados (no tenía columnas propias), así que al consultar un cierre
--     histórico no se podía saber cuánto entró por Nequi.
--  3) ClienteIdentificadorHistorial → auditoría del cambio de número/código de
--     cliente desde Desktop.

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

-- ── 1) Origen del cambio de estado ──────────────────────────────────────────
-- NULL en las filas existentes = 'MANUAL' (comportamiento previo intacto).
CALL lavasuit_add_column_if_missing('PedidoEstadoHistorial', 'origen', 'VARCHAR(20) NULL');

-- ── 2) Desglose completo del cierre de caja ─────────────────────────────────
CALL lavasuit_add_column_if_missing('CajaSesion', 'totalNequi',          'DECIMAL(10,2) NULL');
CALL lavasuit_add_column_if_missing('CajaSesion', 'totalDaviplata',      'DECIMAL(10,2) NULL');
CALL lavasuit_add_column_if_missing('CajaSesion', 'totalGastos',         'DECIMAL(10,2) NULL');
CALL lavasuit_add_column_if_missing('CajaSesion', 'totalGastosEfectivo', 'DECIMAL(10,2) NULL');
CALL lavasuit_add_column_if_missing('CajaSesion', 'denominacionesJson',  'TEXT NULL');

-- Backfill de sesiones YA CERRADAS: reconstruye Nequi/Daviplata y los gastos a
-- partir de los pagos/gastos realmente vinculados a cada sesión. Solo rellena
-- columnas nuevas que están en NULL; no toca ningún importe ya guardado.
UPDATE `CajaSesion` cs
SET cs.`totalNequi` = COALESCE((
      SELECT SUM(p.`monto`) FROM `Pago` p
       WHERE p.`cajaSesionId` = cs.`id` AND p.`metodo` = 'NEQUI'
    ), 0)
WHERE cs.`estado` = 'CERRADA' AND cs.`totalNequi` IS NULL;

UPDATE `CajaSesion` cs
SET cs.`totalDaviplata` = COALESCE((
      SELECT SUM(p.`monto`) FROM `Pago` p
       WHERE p.`cajaSesionId` = cs.`id` AND p.`metodo` = 'DAVIPLATA'
    ), 0)
WHERE cs.`estado` = 'CERRADA' AND cs.`totalDaviplata` IS NULL;

UPDATE `CajaSesion` cs
SET cs.`totalGastos` = COALESCE((
      SELECT SUM(g.`valor`) FROM `Gasto` g
       WHERE g.`cajaSesionId` = cs.`id` AND g.`deletedAt` IS NULL
    ), 0)
WHERE cs.`estado` = 'CERRADA' AND cs.`totalGastos` IS NULL;

UPDATE `CajaSesion` cs
SET cs.`totalGastosEfectivo` = COALESCE((
      SELECT SUM(g.`valor`) FROM `Gasto` g
       WHERE g.`cajaSesionId` = cs.`id` AND g.`deletedAt` IS NULL
         AND (g.`metodoPago` IS NULL OR g.`metodoPago` = 'EFECTIVO')
    ), 0)
WHERE cs.`estado` = 'CERRADA' AND cs.`totalGastosEfectivo` IS NULL;

-- ── 3) Auditoría de cambio de identificador de cliente ──────────────────────
CREATE TABLE IF NOT EXISTS `ClienteIdentificadorHistorial` (
  `id`                    VARCHAR(191) NOT NULL,
  `clienteId`             VARCHAR(191) NOT NULL,
  `usuarioId`             VARCHAR(191) NULL,
  `identificadorAnterior` VARCHAR(40)  NULL,
  `identificadorNuevo`    VARCHAR(40)  NULL,
  `ordenBaseAnterior`     INT          NULL,
  `subOrdenAnterior`      INT          NULL,
  `ordenBaseNuevo`        INT          NULL,
  `subOrdenNuevo`         INT          NULL,
  `motivo`                TEXT         NOT NULL,
  `createdAt`             DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL lavasuit_add_index_if_missing('ClienteIdentificadorHistorial', 'ClienteIdentificadorHistorial_clienteId_idx', '`clienteId`');
CALL lavasuit_add_index_if_missing('ClienteIdentificadorHistorial', 'ClienteIdentificadorHistorial_usuarioId_idx', '`usuarioId`');
CALL lavasuit_add_index_if_missing('ClienteIdentificadorHistorial', 'ClienteIdentificadorHistorial_createdAt_idx', '`createdAt`');

SET @fkCliente := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'ClienteIdentificadorHistorial'
     AND CONSTRAINT_NAME = 'ClienteIdentificadorHistorial_clienteId_fkey'
);
SET @sql := IF(@fkCliente = 0,
  'ALTER TABLE `ClienteIdentificadorHistorial` ADD CONSTRAINT `ClienteIdentificadorHistorial_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `Cliente`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fkUsuario := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'ClienteIdentificadorHistorial'
     AND CONSTRAINT_NAME = 'ClienteIdentificadorHistorial_usuarioId_fkey'
);
SET @sql := IF(@fkUsuario = 0,
  'ALTER TABLE `ClienteIdentificadorHistorial` ADD CONSTRAINT `ClienteIdentificadorHistorial_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP PROCEDURE IF EXISTS lavasuit_add_column_if_missing;
DROP PROCEDURE IF EXISTS lavasuit_add_index_if_missing;
