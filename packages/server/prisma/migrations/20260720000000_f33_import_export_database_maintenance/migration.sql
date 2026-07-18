-- F33 — Import, Export, and Database Maintenance.
-- Adds a persistent, auditable, Commissioner-controlled maintenance center:
-- versioned configuration presets, export/import/validation/reset run records,
-- and append-only maintenance event history. This migration is purely
-- additive: it creates new tables/indexes only, performs no domain operations,
-- creates no export, runs no validation, and resets nothing. All new columns
-- are nullable/default-safe. Engine owns policy; server owns all file/database
-- operations. Destructive maintenance actions require a VERIFIED F32 backup
-- before mutation; database validation never silently repairs; reset preserves
-- migrations and backup files.

-- Maintenance configuration presets (mirrors the BackupPreset pattern).
CREATE TABLE "MaintenancePreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "MaintenancePresetVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presetId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "configJson" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "changeReason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBySource" TEXT,
    CONSTRAINT "MaintenancePresetVersion_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "MaintenancePreset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ActiveMaintenanceConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "activePresetVersionId" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ActiveMaintenanceConfiguration_activePresetVersionId_fkey" FOREIGN KEY ("activePresetVersionId") REFERENCES "MaintenancePresetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "MaintenanceExportRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exportType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "scopeText" TEXT NOT NULL,
    "filterText" TEXT NOT NULL,
    "privacyLevel" TEXT NOT NULL,
    "configVersionId" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "outputRelativePath" TEXT,
    "manifestRelativePath" TEXT,
    "rowCount" INTEGER,
    "fileSizeBytes" INTEGER,
    "fileSha256" TEXT,
    "manifestSha256" TEXT,
    "inputHash" TEXT NOT NULL,
    "resultHash" TEXT,
    "requestedBy" TEXT NOT NULL DEFAULT 'system',
    "reason" TEXT NOT NULL DEFAULT '',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "failedAt" DATETIME,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaintenanceExportRun_configVersionId_fkey" FOREIGN KEY ("configVersionId") REFERENCES "MaintenancePresetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "MaintenanceImportRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "sourceFileSizeBytes" INTEGER NOT NULL,
    "sourceFileSha256" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "configVersionId" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "previewSnapshotText" TEXT NOT NULL,
    "previewHash" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "validRows" INTEGER NOT NULL,
    "warningRows" INTEGER NOT NULL,
    "invalidRows" INTEGER NOT NULL,
    "appliedRows" INTEGER,
    "skippedRows" INTEGER,
    "backupId" TEXT,
    "requestedBy" TEXT NOT NULL DEFAULT 'system',
    "reason" TEXT NOT NULL DEFAULT '',
    "preparedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "failedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaintenanceImportRun_configVersionId_fkey" FOREIGN KEY ("configVersionId") REFERENCES "MaintenancePresetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "MaintenanceImportIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importRunId" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "fieldName" TEXT,
    "severity" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "normalizedValue" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaintenanceImportIssue_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "MaintenanceImportRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MaintenanceValidationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'FULL',
    "configVersionId" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "databaseFingerprint" TEXT NOT NULL,
    "checkCount" INTEGER NOT NULL,
    "blockerCount" INTEGER NOT NULL,
    "warningCount" INTEGER NOT NULL,
    "resultSnapshotText" TEXT NOT NULL,
    "resultHash" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL DEFAULT 'system',
    "reason" TEXT NOT NULL DEFAULT '',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "failedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaintenanceValidationRun_configVersionId_fkey" FOREIGN KEY ("configVersionId") REFERENCES "MaintenancePresetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "InitializationResetRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "resetMode" TEXT NOT NULL,
    "backupId" TEXT,
    "previewSnapshotText" TEXT NOT NULL,
    "previewHash" TEXT NOT NULL,
    "confirmationHash" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL DEFAULT 'system',
    "reason" TEXT NOT NULL DEFAULT '',
    "preparedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "failedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "MaintenanceEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "statusBefore" TEXT,
    "statusAfter" TEXT,
    "summaryText" TEXT NOT NULL,
    "eventHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE UNIQUE INDEX "MaintenancePreset_name_key" ON "MaintenancePreset"("name");
CREATE INDEX "MaintenancePresetVersion_configHash_idx" ON "MaintenancePresetVersion"("configHash");
CREATE UNIQUE INDEX "MaintenancePresetVersion_presetId_versionNumber_key" ON "MaintenancePresetVersion"("presetId", "versionNumber");
CREATE UNIQUE INDEX "ActiveMaintenanceConfiguration_activePresetVersionId_key" ON "ActiveMaintenanceConfiguration"("activePresetVersionId");

CREATE INDEX "MaintenanceExportRun_exportType_idx" ON "MaintenanceExportRun"("exportType");
CREATE INDEX "MaintenanceExportRun_status_idx" ON "MaintenanceExportRun"("status");
CREATE INDEX "MaintenanceExportRun_createdAt_idx" ON "MaintenanceExportRun"("createdAt");
CREATE INDEX "MaintenanceExportRun_privacyLevel_idx" ON "MaintenanceExportRun"("privacyLevel");

CREATE INDEX "MaintenanceImportRun_importType_idx" ON "MaintenanceImportRun"("importType");
CREATE INDEX "MaintenanceImportRun_status_idx" ON "MaintenanceImportRun"("status");
CREATE INDEX "MaintenanceImportRun_createdAt_idx" ON "MaintenanceImportRun"("createdAt");

CREATE INDEX "MaintenanceImportIssue_importRunId_rowNumber_idx" ON "MaintenanceImportIssue"("importRunId", "rowNumber");
CREATE INDEX "MaintenanceImportIssue_severity_idx" ON "MaintenanceImportIssue"("severity");

CREATE INDEX "MaintenanceValidationRun_status_idx" ON "MaintenanceValidationRun"("status");
CREATE INDEX "MaintenanceValidationRun_createdAt_idx" ON "MaintenanceValidationRun"("createdAt");

CREATE INDEX "InitializationResetRun_status_idx" ON "InitializationResetRun"("status");
CREATE INDEX "InitializationResetRun_resetMode_idx" ON "InitializationResetRun"("resetMode");
CREATE INDEX "InitializationResetRun_createdAt_idx" ON "InitializationResetRun"("createdAt");

CREATE INDEX "MaintenanceEvent_entityType_entityId_createdAt_idx" ON "MaintenanceEvent"("entityType", "entityId", "createdAt");
CREATE INDEX "MaintenanceEvent_eventType_createdAt_idx" ON "MaintenanceEvent"("eventType", "createdAt");
CREATE INDEX "MaintenanceEvent_createdAt_idx" ON "MaintenanceEvent"("createdAt");
