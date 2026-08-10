-- Copias de seguridad en Google Drive.
--
-- Mismas tablas y columnas que el proyecto de referencia
-- (lavanderiasoftware/src/backend/db/migrations/004b_google_drive_backups.sql),
-- para que el sistema sea idéntico.
--
-- 100% ADITIVA: dos tablas nuevas. No toca nada existente.
-- Nota: `google_drive_tokens.user_id` es VARCHAR porque en LavaSuit los
-- usuarios tienen id UUID (en el proyecto de referencia eran INT).

CREATE TABLE IF NOT EXISTS `google_drive_tokens` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `user_id`       VARCHAR(191) NULL,
  `access_token`  TEXT NULL,
  `refresh_token` TEXT NULL,
  `scope`         TEXT NULL,
  `token_type`    VARCHAR(100) NULL,
  `expiry_date`   BIGINT NULL,
  `created_at`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `backups` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `file_name`     VARCHAR(255) NOT NULL,
  `drive_file_id` VARCHAR(255) NULL,
  `status`        VARCHAR(50) NOT NULL DEFAULT 'CREATED',
  `message`       TEXT NULL,
  `created_at`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
