-- F32 — Backup and Recovery.
-- Adds a persistent, auditable, Commissioner-controlled backup/recovery layer
-- for the local SQLite world database. This migration is purely additive: it
-- creates new tables/indexes only, performs no domain operations, creates no
-- backup, no restore marker, and moves no database file. All new columns are
-- nullable/default-safe. Restore is restart-required (atomic file replacement
-- happens in a pre-Prisma startup bootstrap, never during normal operation).
-- Engine owns policy; server owns all file/database operations.

-- Backup configuration presets (mirrors the SeasonTransitionPreset pattern).
CREATE TABLE "BackupPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "BackupPresetVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presetId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "configJson" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "changeReason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBySource" TEXT,
    CONSTRAINT "BackupPresetVersion_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "BackupPreset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ActiveBackupConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "activePresetVersionId" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ActiveBackupConfiguration_activePresetVersionId_fkey" FOREIGN KEY ("activePresetVersionId") REFERENCES "BackupPresetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "DatabaseBackup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "backupType" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reasonText" TEXT NOT NULL DEFAULT '',
    "sourceDatabasePathSnapshot" TEXT NOT NULL,
    "relativeFilePath" TEXT NOT NULL,
    "manifestRelativePath" TEXT,
    "fileName" TEXT NOT NULL,
    "fileSizeBytes" INTEGER,
    "fileSha256" TEXT,
    "manifestSha256" TEXT,
    "databaseFingerprint" TEXT,
    "schemaMigrationCount" INTEGER,
    "latestMigrationName" TEXT,
    "worldSeasonIdSnapshot" TEXT,
    "currentWorldSeasonNameSnapshot" TEXT,
    "sourceOperationType" TEXT,
    "sourceOperationId" TEXT,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "protected" BOOLEAN NOT NULL DEFAULT false,
    "protectionReason" TEXT,
    "configVersionId" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "verifiedAt" DATETIME,
    "failedAt" DATETIME,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DatabaseBackup_configVersionId_fkey" FOREIGN KEY ("configVersionId") REFERENCES "BackupPresetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "DatabaseRestoreRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "sourceBackupId" TEXT NOT NULL,
    "preRestoreBackupId" TEXT,
    "sourceBackupFingerprint" TEXT NOT NULL,
    "expectedCurrentFingerprint" TEXT NOT NULL,
    "currentDatabaseFingerprintBefore" TEXT,
    "restoredDatabaseFingerprintAfter" TEXT,
    "configVersionId" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "restartRequired" BOOLEAN NOT NULL DEFAULT true,
    "requestedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "preparedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "failedAt" DATETIME,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DatabaseRestoreRun_sourceBackupId_fkey" FOREIGN KEY ("sourceBackupId") REFERENCES "DatabaseBackup" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DatabaseRestoreRun_preRestoreBackupId_fkey" FOREIGN KEY ("preRestoreBackupId") REFERENCES "DatabaseBackup" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DatabaseRestoreRun_configVersionId_fkey" FOREIGN KEY ("configVersionId") REFERENCES "BackupPresetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "DatabaseRestoreEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restoreRunId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "statusBefore" TEXT,
    "statusAfter" TEXT,
    "summaryText" TEXT NOT NULL,
    "eventHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DatabaseRestoreEvent_restoreRunId_fkey" FOREIGN KEY ("restoreRunId") REFERENCES "DatabaseRestoreRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Indexes
CREATE UNIQUE INDEX "BackupPreset_name_key" ON "BackupPreset"("name");
CREATE INDEX "BackupPresetVersion_configHash_idx" ON "BackupPresetVersion"("configHash");
CREATE UNIQUE INDEX "BackupPresetVersion_presetId_versionNumber_key" ON "BackupPresetVersion"("presetId", "versionNumber");
CREATE UNIQUE INDEX "ActiveBackupConfiguration_activePresetVersionId_key" ON "ActiveBackupConfiguration"("activePresetVersionId");

CREATE INDEX "DatabaseBackup_status_idx" ON "DatabaseBackup"("status");
CREATE INDEX "DatabaseBackup_backupType_idx" ON "DatabaseBackup"("backupType");
CREATE INDEX "DatabaseBackup_reasonCode_idx" ON "DatabaseBackup"("reasonCode");
CREATE INDEX "DatabaseBackup_createdAt_idx" ON "DatabaseBackup"("createdAt");
CREATE INDEX "DatabaseBackup_protected_idx" ON "DatabaseBackup"("protected");
CREATE INDEX "DatabaseBackup_sourceOperationType_sourceOperationId_idx" ON "DatabaseBackup"("sourceOperationType", "sourceOperationId");
CREATE INDEX "DatabaseBackup_configVersionId_idx" ON "DatabaseBackup"("configVersionId");

CREATE INDEX "DatabaseRestoreRun_status_idx" ON "DatabaseRestoreRun"("status");
CREATE INDEX "DatabaseRestoreRun_createdAt_idx" ON "DatabaseRestoreRun"("createdAt");
CREATE INDEX "DatabaseRestoreRun_sourceBackupId_idx" ON "DatabaseRestoreRun"("sourceBackupId");

CREATE INDEX "DatabaseRestoreEvent_restoreRunId_createdAt_idx" ON "DatabaseRestoreEvent"("restoreRunId", "createdAt");
CREATE INDEX "DatabaseRestoreEvent_eventType_createdAt_idx" ON "DatabaseRestoreEvent"("eventType", "createdAt");
