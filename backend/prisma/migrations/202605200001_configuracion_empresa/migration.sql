-- Configuración de empresa para impresión de recibos (tabla singleton).
CREATE TABLE `ConfiguracionEmpresa` (
  `id`               VARCHAR(191) NOT NULL DEFAULT 'singleton',
  `nombreNegocio`    VARCHAR(150) NOT NULL DEFAULT 'LavaSuit',
  `nit`              VARCHAR(40)  NULL,
  `telefono`         VARCHAR(40)  NULL,
  `direccion`        VARCHAR(255) NULL,
  `ciudad`           VARCHAR(120) NULL,
  `logoBase64`       LONGTEXT     NULL,
  `politicasTexto`   TEXT         NULL,
  `garantiaTexto`    TEXT         NULL,
  `pieRecibo`        TEXT         NULL,
  `actualizadoPorId` VARCHAR(191) NULL,
  `createdAt`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`        DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Fila inicial con valores por defecto.
INSERT INTO `ConfiguracionEmpresa` (`id`, `nombreNegocio`, `updatedAt`)
VALUES ('singleton', 'LavaSuit', CURRENT_TIMESTAMP(3));
