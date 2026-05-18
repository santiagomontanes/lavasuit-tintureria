CREATE TABLE `SyncOperation` (
  `id` VARCHAR(191) NOT NULL,
  `entityType` VARCHAR(30) NOT NULL,
  `entityId` VARCHAR(36) NOT NULL,
  `action` VARCHAR(40) NOT NULL,
  `clientMutationId` VARCHAR(80) NOT NULL,
  `deviceId` VARCHAR(80) NOT NULL,
  `payloadHash` VARCHAR(64) NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'COMPLETED',
  `createdOfflineAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `SyncOperation_clientMutationId_deviceId_key` (`clientMutationId`, `deviceId`),
  INDEX `SyncOperation_entityType_entityId_idx` (`entityType`, `entityId`),
  INDEX `SyncOperation_deviceId_idx` (`deviceId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
