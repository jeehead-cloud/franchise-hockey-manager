-- F24 Player Development: RETIRED status, form field, config presets, runs, snapshots.

-- AlterTable
ALTER TABLE "Player" ADD COLUMN "form" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PlayerDevelopmentPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlayerDevelopmentPresetVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presetId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "configJson" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "changeReason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBySource" TEXT,
    CONSTRAINT "PlayerDevelopmentPresetVersion_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "PlayerDevelopmentPreset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivePlayerDevelopmentConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "activePresetVersionId" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ActivePlayerDevelopmentConfiguration_activePresetVersionId_fkey" FOREIGN KEY ("activePresetVersionId") REFERENCES "PlayerDevelopmentPresetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerDevelopmentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldSeasonId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "runVersion" INTEGER NOT NULL,
    "effectiveDate" TEXT NOT NULL,
    "baseSeed" TEXT NOT NULL,
    "configVersionId" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "resultHash" TEXT,
    "totalPlayers" INTEGER NOT NULL DEFAULT 0,
    "developedCount" INTEGER NOT NULL DEFAULT 0,
    "declinedCount" INTEGER NOT NULL DEFAULT 0,
    "stableCount" INTEGER NOT NULL DEFAULT 0,
    "retiredCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "backupPath" TEXT,
    "failureReason" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "failedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerDevelopmentRun_worldSeasonId_fkey" FOREIGN KEY ("worldSeasonId") REFERENCES "WorldSeason" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlayerDevelopmentRun_configVersionId_fkey" FOREIGN KEY ("configVersionId") REFERENCES "PlayerDevelopmentPresetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerDevelopmentResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "playerNameSnapshot" TEXT NOT NULL,
    "playerType" TEXT NOT NULL,
    "positionSnapshot" TEXT NOT NULL,
    "teamIdSnapshot" TEXT,
    "teamNameSnapshot" TEXT,
    "ageBefore" INTEGER,
    "ageOnEffectiveDate" INTEGER NOT NULL,
    "lifecycleBefore" TEXT NOT NULL,
    "lifecycleAfter" TEXT NOT NULL,
    "currentAbilityBefore" REAL NOT NULL,
    "currentAbilityAfter" REAL NOT NULL,
    "potentialSnapshot" INTEGER NOT NULL,
    "roleBefore" TEXT NOT NULL,
    "roleAfter" TEXT NOT NULL,
    "formBefore" INTEGER NOT NULL,
    "formAfter" INTEGER NOT NULL,
    "developmentBudget" REAL NOT NULL,
    "usedBudget" REAL NOT NULL,
    "unusedBudget" REAL NOT NULL,
    "outcome" TEXT NOT NULL,
    "retired" BOOLEAN NOT NULL,
    "retirementReasonText" TEXT,
    "attributeChangesText" TEXT NOT NULL,
    "diagnosticsText" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "resultHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerDevelopmentResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayerDevelopmentRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlayerDevelopmentResult_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerSeasonSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "worldSeasonId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "snapshotType" TEXT NOT NULL,
    "snapshotDate" TEXT NOT NULL,
    "playerNameSnapshot" TEXT NOT NULL,
    "teamIdSnapshot" TEXT,
    "teamNameSnapshot" TEXT,
    "playerStatusSnapshot" TEXT NOT NULL,
    "positionSnapshot" TEXT NOT NULL,
    "roleSnapshot" TEXT,
    "currentAbilitySnapshot" REAL,
    "potentialSnapshot" INTEGER,
    "formSnapshot" INTEGER NOT NULL,
    "attributesText" TEXT NOT NULL,
    "attributesHash" TEXT NOT NULL,
    "playerUpdatedAtSnapshot" DATETIME NOT NULL,
    "inputHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerSeasonSnapshot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlayerSeasonSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlayerDevelopmentRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlayerSeasonSnapshot_worldSeasonId_fkey" FOREIGN KEY ("worldSeasonId") REFERENCES "WorldSeason" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerDevelopmentPreset_name_key" ON "PlayerDevelopmentPreset"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerDevelopmentPresetVersion_presetId_versionNumber_key" ON "PlayerDevelopmentPresetVersion"("presetId", "versionNumber");

-- CreateIndex
CREATE INDEX "PlayerDevelopmentPresetVersion_configHash_idx" ON "PlayerDevelopmentPresetVersion"("configHash");

-- CreateIndex
CREATE INDEX "PlayerDevelopmentPresetVersion_presetId_createdAt_idx" ON "PlayerDevelopmentPresetVersion"("presetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActivePlayerDevelopmentConfiguration_activePresetVersionId_key" ON "ActivePlayerDevelopmentConfiguration"("activePresetVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerDevelopmentRun_worldSeasonId_runVersion_key" ON "PlayerDevelopmentRun"("worldSeasonId", "runVersion");

-- CreateIndex
CREATE INDEX "PlayerDevelopmentRun_worldSeasonId_status_idx" ON "PlayerDevelopmentRun"("worldSeasonId", "status");

-- CreateIndex
CREATE INDEX "PlayerDevelopmentRun_worldSeasonId_isCurrent_idx" ON "PlayerDevelopmentRun"("worldSeasonId", "isCurrent");

-- CreateIndex
CREATE INDEX "PlayerDevelopmentRun_inputHash_idx" ON "PlayerDevelopmentRun"("inputHash");

-- CreateIndex
CREATE INDEX "PlayerDevelopmentRun_configHash_idx" ON "PlayerDevelopmentRun"("configHash");

-- CreateIndex
CREATE INDEX "PlayerDevelopmentRun_resultHash_idx" ON "PlayerDevelopmentRun"("resultHash");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerDevelopmentResult_runId_playerId_key" ON "PlayerDevelopmentResult"("runId", "playerId");

-- CreateIndex
CREATE INDEX "PlayerDevelopmentResult_runId_outcome_idx" ON "PlayerDevelopmentResult"("runId", "outcome");

-- CreateIndex
CREATE INDEX "PlayerDevelopmentResult_playerId_idx" ON "PlayerDevelopmentResult"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerSeasonSnapshot_playerId_runId_snapshotType_key" ON "PlayerSeasonSnapshot"("playerId", "runId", "snapshotType");

-- CreateIndex
CREATE INDEX "PlayerSeasonSnapshot_playerId_worldSeasonId_idx" ON "PlayerSeasonSnapshot"("playerId", "worldSeasonId");

-- CreateIndex
CREATE INDEX "PlayerSeasonSnapshot_runId_snapshotType_idx" ON "PlayerSeasonSnapshot"("runId", "snapshotType");
