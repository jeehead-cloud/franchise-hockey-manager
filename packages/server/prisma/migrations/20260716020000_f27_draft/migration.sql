-- CreateTable
CREATE TABLE "DraftPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DraftPresetVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presetId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "configJson" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "changeReason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBySource" TEXT,
    CONSTRAINT "DraftPresetVersion_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "DraftPreset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActiveDraftConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "activePresetVersionId" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ActiveDraftConfiguration_activePresetVersionId_fkey" FOREIGN KEY ("activePresetVersionId") REFERENCES "DraftPresetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DraftEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldSeasonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "presetVersionId" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "cutoffDate" TEXT NOT NULL,
    "baseSeed" TEXT NOT NULL,
    "eligibilityHash" TEXT,
    "initialOrderHash" TEXT,
    "lotteryHash" TEXT,
    "finalOrderHash" TEXT,
    "currentOverallPick" INTEGER NOT NULL DEFAULT 0,
    "totalRounds" INTEGER NOT NULL,
    "totalPicks" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "resultHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DraftEvent_worldSeasonId_fkey" FOREIGN KEY ("worldSeasonId") REFERENCES "WorldSeason" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DraftEvent_presetVersionId_fkey" FOREIGN KEY ("presetVersionId") REFERENCES "DraftPresetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DraftEligiblePlayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftEventId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "playerNameSnapshot" TEXT NOT NULL,
    "birthDateSnapshot" TEXT NOT NULL,
    "ageOnCutoffDate" INTEGER NOT NULL,
    "countrySnapshot" TEXT,
    "positionSnapshot" TEXT,
    "lifecycleSnapshot" TEXT NOT NULL,
    "sourceTypeSnapshot" TEXT NOT NULL,
    "eligibilityHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DraftEligiblePlayer_draftEventId_fkey" FOREIGN KEY ("draftEventId") REFERENCES "DraftEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DraftEligiblePlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DraftTeamEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftEventId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamNameSnapshot" TEXT NOT NULL,
    "originalOrderPosition" INTEGER NOT NULL,
    "lotteryOrderPosition" INTEGER,
    "finalOrderPosition" INTEGER,
    "sourceStandingRank" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DraftTeamEntry_draftEventId_fkey" FOREIGN KEY ("draftEventId") REFERENCES "DraftEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DraftTeamEntry_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DraftLotteryDraw" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftEventId" TEXT NOT NULL,
    "drawNumber" INTEGER NOT NULL,
    "winningTeamId" TEXT NOT NULL,
    "originalPosition" INTEGER NOT NULL,
    "newPosition" INTEGER NOT NULL,
    "weightSnapshot" REAL NOT NULL,
    "seedFragment" TEXT NOT NULL,
    "drawHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DraftLotteryDraw_draftEventId_fkey" FOREIGN KEY ("draftEventId") REFERENCES "DraftEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DraftPick" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftEventId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "pickInRound" INTEGER NOT NULL,
    "overallPick" INTEGER NOT NULL,
    "originalTeamId" TEXT NOT NULL,
    "currentTeamId" TEXT NOT NULL,
    "teamNameSnapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "selectedPlayerId" TEXT,
    "selectedPlayerNameSnapshot" TEXT,
    "selectedAt" DATETIME,
    "selectionSource" TEXT,
    "scoutingReportId" TEXT,
    "teamBoardSnapshotText" TEXT,
    "pickHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DraftPick_draftEventId_fkey" FOREIGN KEY ("draftEventId") REFERENCES "DraftEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DraftPick_originalTeamId_fkey" FOREIGN KEY ("originalTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DraftPick_currentTeamId_fkey" FOREIGN KEY ("currentTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DraftPick_selectedPlayerId_fkey" FOREIGN KEY ("selectedPlayerId") REFERENCES "DraftEligiblePlayer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerDraftRight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "draftEventId" TEXT NOT NULL,
    "draftPickId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "acquiredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "playerNameSnapshot" TEXT NOT NULL,
    "teamNameSnapshot" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerDraftRight_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlayerDraftRight_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerDraftRight_draftEventId_fkey" FOREIGN KEY ("draftEventId") REFERENCES "DraftEvent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlayerDraftRight_draftPickId_fkey" FOREIGN KEY ("draftPickId") REFERENCES "DraftPick" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DraftTeamBoardSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftEventId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "boardText" TEXT NOT NULL,
    "boardHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DraftTeamBoardSnapshot_draftEventId_fkey" FOREIGN KEY ("draftEventId") REFERENCES "DraftEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DraftTeamBoardSnapshot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DraftPreset_name_key" ON "DraftPreset"("name");

-- CreateIndex
CREATE INDEX "DraftPresetVersion_configHash_idx" ON "DraftPresetVersion"("configHash");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPresetVersion_presetId_versionNumber_key" ON "DraftPresetVersion"("presetId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveDraftConfiguration_activePresetVersionId_key" ON "ActiveDraftConfiguration"("activePresetVersionId");

-- CreateIndex
CREATE INDEX "DraftEvent_worldSeasonId_status_idx" ON "DraftEvent"("worldSeasonId", "status");

-- CreateIndex
CREATE INDEX "DraftEvent_status_idx" ON "DraftEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DraftEvent_worldSeasonId_name_key" ON "DraftEvent"("worldSeasonId", "name");

-- CreateIndex
CREATE INDEX "DraftEligiblePlayer_draftEventId_status_idx" ON "DraftEligiblePlayer"("draftEventId", "status");

-- CreateIndex
CREATE INDEX "DraftEligiblePlayer_playerId_idx" ON "DraftEligiblePlayer"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftEligiblePlayer_draftEventId_playerId_key" ON "DraftEligiblePlayer"("draftEventId", "playerId");

-- CreateIndex
CREATE INDEX "DraftTeamEntry_draftEventId_finalOrderPosition_idx" ON "DraftTeamEntry"("draftEventId", "finalOrderPosition");

-- CreateIndex
CREATE INDEX "DraftTeamEntry_teamId_idx" ON "DraftTeamEntry"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftTeamEntry_draftEventId_teamId_key" ON "DraftTeamEntry"("draftEventId", "teamId");

-- CreateIndex
CREATE INDEX "DraftLotteryDraw_draftEventId_idx" ON "DraftLotteryDraw"("draftEventId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftLotteryDraw_draftEventId_drawNumber_key" ON "DraftLotteryDraw"("draftEventId", "drawNumber");

-- CreateIndex
CREATE INDEX "DraftPick_draftEventId_currentTeamId_status_idx" ON "DraftPick"("draftEventId", "currentTeamId", "status");

-- CreateIndex
CREATE INDEX "DraftPick_draftEventId_status_idx" ON "DraftPick"("draftEventId", "status");

-- CreateIndex
CREATE INDEX "DraftPick_currentTeamId_idx" ON "DraftPick"("currentTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftEventId_overallPick_key" ON "DraftPick"("draftEventId", "overallPick");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftEventId_roundNumber_pickInRound_key" ON "DraftPick"("draftEventId", "roundNumber", "pickInRound");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftEventId_selectedPlayerId_key" ON "DraftPick"("draftEventId", "selectedPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerDraftRight_draftPickId_key" ON "PlayerDraftRight"("draftPickId");

-- CreateIndex
CREATE INDEX "PlayerDraftRight_playerId_status_idx" ON "PlayerDraftRight"("playerId", "status");

-- CreateIndex
CREATE INDEX "PlayerDraftRight_teamId_status_idx" ON "PlayerDraftRight"("teamId", "status");

-- CreateIndex
CREATE INDEX "PlayerDraftRight_draftEventId_idx" ON "PlayerDraftRight"("draftEventId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerDraftRight_playerId_status_key" ON "PlayerDraftRight"("playerId", "status");

-- CreateIndex
CREATE INDEX "DraftTeamBoardSnapshot_teamId_idx" ON "DraftTeamBoardSnapshot"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftTeamBoardSnapshot_draftEventId_teamId_key" ON "DraftTeamBoardSnapshot"("draftEventId", "teamId");

