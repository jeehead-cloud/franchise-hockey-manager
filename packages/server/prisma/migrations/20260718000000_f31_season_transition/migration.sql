-- F31 — Season Transition (Renewable World Cycle).
-- Adds a persistent, deterministic, Commissioner-controlled season-rollover
-- workflow. F31 consumes a completed F30 OffseasonRun and creates exactly one
-- next WorldSeason plus its CompetitionEditions in one atomic transaction.
-- This migration is additive: it performs no domain operations, no ownership
-- changes, no Player mutation, and creates no target WorldSeason.

-- Season-transition configuration presets.
CREATE TABLE "SeasonTransitionPreset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "SeasonTransitionPreset_name_key" ON "SeasonTransitionPreset"("name");

CREATE TABLE "SeasonTransitionPresetVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "presetId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "schemaVersion" INTEGER NOT NULL,
  "configJson" TEXT NOT NULL,
  "configHash" TEXT NOT NULL,
  "changeReason" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBySource" TEXT,
  CONSTRAINT "SeasonTransitionPresetVersion_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "SeasonTransitionPreset"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SeasonTransitionPresetVersion_presetId_versionNumber_key" ON "SeasonTransitionPresetVersion"("presetId", "versionNumber");
CREATE INDEX "SeasonTransitionPresetVersion_configHash_idx" ON "SeasonTransitionPresetVersion"("configHash");

CREATE TABLE "ActiveSeasonTransitionConfiguration" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
  "activePresetVersionId" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ActiveSeasonTransitionConfiguration_activePresetVersionId_fkey" FOREIGN KEY ("activePresetVersionId") REFERENCES "SeasonTransitionPresetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ActiveSeasonTransitionConfiguration_activePresetVersionId_key" ON "ActiveSeasonTransitionConfiguration"("activePresetVersionId");

-- Season-transition runs — one current (PREPARED/RUNNING/COMPLETED) transition
-- per source WorldSeason enforced at the service layer. The target
-- WorldSeason is created only on atomic execution (nullable here).
CREATE TABLE "SeasonTransitionRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceWorldSeasonId" TEXT NOT NULL,
  "targetWorldSeasonId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PREPARED',
  "configVersionId" TEXT NOT NULL,
  "configHash" TEXT NOT NULL,
  "runVersion" INTEGER NOT NULL DEFAULT 1,
  "targetDisplayName" TEXT NOT NULL,
  "targetSeasonOrder" INTEGER NOT NULL,
  "targetStartDateIso" TEXT,
  "targetEndDateIso" TEXT,
  "inputSnapshotText" TEXT NOT NULL DEFAULT '{}',
  "inputHash" TEXT NOT NULL,
  "planSnapshotText" TEXT NOT NULL DEFAULT '{}',
  "planHash" TEXT NOT NULL,
  "resultHash" TEXT,
  "preparedAt" DATETIME,
  "startedAt" DATETIME,
  "completedAt" DATETIME,
  "failedAt" DATETIME,
  "cancelledAt" DATETIME,
  "backupMetadataText" TEXT,
  "reason" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "SeasonTransitionRun_sourceWorldSeasonId_fkey" FOREIGN KEY ("sourceWorldSeasonId") REFERENCES "WorldSeason"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SeasonTransitionRun_targetWorldSeasonId_fkey" FOREIGN KEY ("targetWorldSeasonId") REFERENCES "WorldSeason"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SeasonTransitionRun_configVersionId_fkey" FOREIGN KEY ("configVersionId") REFERENCES "SeasonTransitionPresetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- One source per target season: enforced by the unique index on targetWorldSeasonId.
CREATE UNIQUE INDEX "SeasonTransitionRun_targetWorldSeasonId_key" ON "SeasonTransitionRun"("targetWorldSeasonId");
CREATE INDEX "SeasonTransitionRun_sourceWorldSeasonId_status_idx" ON "SeasonTransitionRun"("sourceWorldSeasonId", "status");
CREATE INDEX "SeasonTransitionRun_targetWorldSeasonId_idx" ON "SeasonTransitionRun"("targetWorldSeasonId");
CREATE INDEX "SeasonTransitionRun_targetSeasonOrder_idx" ON "SeasonTransitionRun"("targetSeasonOrder");
CREATE INDEX "SeasonTransitionRun_status_idx" ON "SeasonTransitionRun"("status");
CREATE INDEX "SeasonTransitionRun_configVersionId_idx" ON "SeasonTransitionRun"("configVersionId");

-- Immutable entity summary for a transition run. Prefer aggregate records for
-- unchanged large sets (e.g. one CONTRACT_STATE row) — never one per Player.
CREATE TABLE "SeasonTransitionEntityRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "seasonTransitionRunId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "sourceEntityId" TEXT,
  "targetEntityId" TEXT,
  "action" TEXT NOT NULL,
  "snapshotText" TEXT NOT NULL DEFAULT '{}',
  "snapshotHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeasonTransitionEntityRecord_seasonTransitionRunId_fkey" FOREIGN KEY ("seasonTransitionRunId") REFERENCES "SeasonTransitionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SeasonTransitionEntityRecord_seasonTransitionRunId_entityType_idx" ON "SeasonTransitionEntityRecord"("seasonTransitionRunId", "entityType");
CREATE INDEX "SeasonTransitionEntityRecord_seasonTransitionRunId_sourceEntityId_idx" ON "SeasonTransitionEntityRecord"("seasonTransitionRunId", "sourceEntityId");
CREATE INDEX "SeasonTransitionEntityRecord_seasonTransitionRunId_targetEntityId_idx" ON "SeasonTransitionEntityRecord"("seasonTransitionRunId", "targetEntityId");

-- Append-only orchestration history for a SeasonTransitionRun.
CREATE TABLE "SeasonTransitionEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "seasonTransitionRunId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "statusBefore" TEXT,
  "statusAfter" TEXT,
  "summaryText" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "eventHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeasonTransitionEvent_seasonTransitionRunId_fkey" FOREIGN KEY ("seasonTransitionRunId") REFERENCES "SeasonTransitionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SeasonTransitionEvent_seasonTransitionRunId_createdAt_idx" ON "SeasonTransitionEvent"("seasonTransitionRunId", "createdAt");
CREATE INDEX "SeasonTransitionEvent_eventType_createdAt_idx" ON "SeasonTransitionEvent"("eventType", "createdAt");
