-- F30 — Offseason Workflow.
-- Adds a persistent, resumable, Commissioner-controlled offseason orchestration
-- layer. F30 coordinates existing F20/F24/F25/F27/F28/F29 subsystems through
-- their own services; it performs no domain operations, no ownership changes,
-- and no next-WorldSeason creation during migration.

-- Offseason configuration presets.
CREATE TABLE "OffseasonPreset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "OffseasonPreset_name_key" ON "OffseasonPreset"("name");

CREATE TABLE "OffseasonPresetVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "presetId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "schemaVersion" INTEGER NOT NULL,
  "configJson" TEXT NOT NULL,
  "configHash" TEXT NOT NULL,
  "changeReason" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBySource" TEXT,
  CONSTRAINT "OffseasonPresetVersion_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "OffseasonPreset"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OffseasonPresetVersion_presetId_versionNumber_key" ON "OffseasonPresetVersion"("presetId", "versionNumber");
CREATE INDEX "OffseasonPresetVersion_configHash_idx" ON "OffseasonPresetVersion"("configHash");

CREATE TABLE "ActiveOffseasonConfiguration" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
  "activePresetVersionId" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ActiveOffseasonConfiguration_activePresetVersionId_fkey" FOREIGN KEY ("activePresetVersionId") REFERENCES "OffseasonPresetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ActiveOffseasonConfiguration_activePresetVersionId_key" ON "ActiveOffseasonConfiguration"("activePresetVersionId");

-- Offseason runs — one current official run per WorldSeason enforced at the
-- service layer (a partial unique index would block any past cancelled run for
-- the same season from coexisting with a fresh one).
CREATE TABLE "OffseasonRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "worldSeasonId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "configVersionId" TEXT NOT NULL,
  "configHash" TEXT NOT NULL,
  "runVersion" INTEGER NOT NULL DEFAULT 1,
  "startedAt" DATETIME,
  "completedAt" DATETIME,
  "cancelledAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "currentPhaseType" TEXT,
  "readinessHash" TEXT,
  "resultHash" TEXT,
  "reason" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  CONSTRAINT "OffseasonRun_worldSeasonId_fkey" FOREIGN KEY ("worldSeasonId") REFERENCES "WorldSeason"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OffseasonRun_configVersionId_fkey" FOREIGN KEY ("configVersionId") REFERENCES "OffseasonPresetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "OffseasonRun_worldSeasonId_status_idx" ON "OffseasonRun"("worldSeasonId", "status");
CREATE INDEX "OffseasonRun_status_idx" ON "OffseasonRun"("status");
CREATE INDEX "OffseasonRun_configVersionId_idx" ON "OffseasonRun"("configVersionId");

-- Offseason phases — ordered, dependency-validated; COMPLETED/SKIPPED immutable.
-- Linked operation ids reference F20/F24/F25/F27/F28 rows via explicit nullable
-- columns (no polymorphic FK).
CREATE TABLE "OffseasonPhase" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "offseasonRunId" TEXT NOT NULL,
  "phaseType" TEXT NOT NULL,
  "phaseOrder" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "required" BOOLEAN NOT NULL,
  "allowSkip" BOOLEAN NOT NULL,
  "competitionArchiveIds" TEXT,
  "contractExpirationRunId" TEXT,
  "playerDevelopmentRunId" TEXT,
  "youthGenerationRunId" TEXT,
  "draftEventId" TEXT,
  "linkedEntityType" TEXT,
  "linkedEntityId" TEXT,
  "startedAt" DATETIME,
  "completedAt" DATETIME,
  "skippedAt" DATETIME,
  "failedAt" DATETIME,
  "readinessText" TEXT NOT NULL DEFAULT '{}',
  "readinessHash" TEXT,
  "resultText" TEXT,
  "resultHash" TEXT,
  "reason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "OffseasonPhase_offseasonRunId_fkey" FOREIGN KEY ("offseasonRunId") REFERENCES "OffseasonRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OffseasonPhase_offseasonRunId_phaseType_key" ON "OffseasonPhase"("offseasonRunId", "phaseType");
CREATE INDEX "OffseasonPhase_offseasonRunId_phaseOrder_idx" ON "OffseasonPhase"("offseasonRunId", "phaseOrder");
CREATE INDEX "OffseasonPhase_offseasonRunId_status_idx" ON "OffseasonPhase"("offseasonRunId", "status");
CREATE INDEX "OffseasonPhase_offseasonRunId_phaseType_status_idx" ON "OffseasonPhase"("offseasonRunId", "phaseType", "status");
CREATE INDEX "OffseasonPhase_contractExpirationRunId_idx" ON "OffseasonPhase"("contractExpirationRunId");
CREATE INDEX "OffseasonPhase_playerDevelopmentRunId_idx" ON "OffseasonPhase"("playerDevelopmentRunId");
CREATE INDEX "OffseasonPhase_youthGenerationRunId_idx" ON "OffseasonPhase"("youthGenerationRunId");
CREATE INDEX "OffseasonPhase_draftEventId_idx" ON "OffseasonPhase"("draftEventId");

-- Append-only orchestration history (no per-Player or per-Team audit rows).
CREATE TABLE "OffseasonPhaseEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "offseasonRunId" TEXT NOT NULL,
  "offseasonPhaseId" TEXT,
  "eventType" TEXT NOT NULL,
  "statusBefore" TEXT,
  "statusAfter" TEXT,
  "linkedEntityType" TEXT,
  "linkedEntityId" TEXT,
  "summaryText" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "eventHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OffseasonPhaseEvent_offseasonRunId_fkey" FOREIGN KEY ("offseasonRunId") REFERENCES "OffseasonRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OffseasonPhaseEvent_offseasonRunId_createdAt_idx" ON "OffseasonPhaseEvent"("offseasonRunId", "createdAt");
CREATE INDEX "OffseasonPhaseEvent_offseasonRunId_offseasonPhaseId_createdAt_idx" ON "OffseasonPhaseEvent"("offseasonRunId", "offseasonPhaseId", "createdAt");
CREATE INDEX "OffseasonPhaseEvent_eventType_createdAt_idx" ON "OffseasonPhaseEvent"("eventType", "createdAt");
