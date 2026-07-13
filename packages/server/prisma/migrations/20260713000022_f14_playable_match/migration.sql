-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "competitionEditionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "scheduledAt" DATETIME,
    "currentResultId" TEXT,
    "latestSimulationAttemptNumber" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdBySource" TEXT,
    "rulesJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_competitionEditionId_fkey" FOREIGN KEY ("competitionEditionId") REFERENCES "CompetitionEdition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "decisionType" TEXT NOT NULL,
    "homeScore" INTEGER NOT NULL,
    "awayScore" INTEGER NOT NULL,
    "homeRegulationScore" INTEGER NOT NULL,
    "awayRegulationScore" INTEGER NOT NULL,
    "homeOvertimeScore" INTEGER NOT NULL DEFAULT 0,
    "awayOvertimeScore" INTEGER NOT NULL DEFAULT 0,
    "homeShootoutScore" INTEGER NOT NULL DEFAULT 0,
    "awayShootoutScore" INTEGER NOT NULL DEFAULT 0,
    "winnerTeamId" TEXT,
    "engineVersion" TEXT NOT NULL,
    "simulationMode" TEXT NOT NULL,
    "randomSeed" TEXT NOT NULL,
    "inputFingerprint" TEXT NOT NULL,
    "balancePresetId" TEXT NOT NULL,
    "balancePresetVersionId" TEXT NOT NULL,
    "balanceVersionNumber" INTEGER NOT NULL,
    "balanceConfigHash" TEXT NOT NULL,
    "balanceSnapshotText" TEXT NOT NULL,
    "simulationInputText" TEXT NOT NULL,
    "diagnosticsText" TEXT,
    "traceHash" TEXT NOT NULL,
    "reconciliationStatus" TEXT NOT NULL,
    "reconciliationJson" TEXT,
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "supersededAt" DATETIME,
    "supersededByResultId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchResult_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchResultId" TEXT NOT NULL,
    "eventIndex" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "elapsedSeconds" INTEGER NOT NULL,
    "remainingSeconds" INTEGER NOT NULL,
    "teamId" TEXT,
    "primaryPlayerId" TEXT,
    "eventJson" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchEvent_matchResultId_fkey" FOREIGN KEY ("matchResultId") REFERENCES "MatchResult" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerGameStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchResultId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "statsJson" TEXT NOT NULL,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "shotsOnGoal" INTEGER NOT NULL DEFAULT 0,
    "penaltyMinutes" INTEGER NOT NULL DEFAULT 0,
    "powerPlayGoals" INTEGER NOT NULL DEFAULT 0,
    "shortHandedGoals" INTEGER NOT NULL DEFAULT 0,
    "shootoutAttempts" INTEGER NOT NULL DEFAULT 0,
    "shootoutGoals" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerGameStat_matchResultId_fkey" FOREIGN KEY ("matchResultId") REFERENCES "MatchResult" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlayerGameStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamGameStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchResultId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "statsJson" TEXT NOT NULL,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "shotsOnGoal" INTEGER NOT NULL DEFAULT 0,
    "penalties" INTEGER NOT NULL DEFAULT 0,
    "penaltyMinutes" INTEGER NOT NULL DEFAULT 0,
    "powerPlayGoals" INTEGER NOT NULL DEFAULT 0,
    "shortHandedGoals" INTEGER NOT NULL DEFAULT 0,
    "shootoutAttempts" INTEGER NOT NULL DEFAULT 0,
    "shootoutGoals" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamGameStat_matchResultId_fkey" FOREIGN KEY ("matchResultId") REFERENCES "MatchResult" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Match_homeTeamId_idx" ON "Match"("homeTeamId");

-- CreateIndex
CREATE INDEX "Match_awayTeamId_idx" ON "Match"("awayTeamId");

-- CreateIndex
CREATE INDEX "Match_competitionEditionId_idx" ON "Match"("competitionEditionId");

-- CreateIndex
CREATE INDEX "Match_status_idx" ON "Match"("status");

-- CreateIndex
CREATE INDEX "Match_scheduledAt_idx" ON "Match"("scheduledAt");

-- CreateIndex
CREATE INDEX "MatchResult_matchId_status_idx" ON "MatchResult"("matchId", "status");

-- CreateIndex
CREATE INDEX "MatchResult_inputFingerprint_idx" ON "MatchResult"("inputFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "MatchResult_matchId_attemptNumber_key" ON "MatchResult"("matchId", "attemptNumber");

-- CreateIndex
CREATE INDEX "MatchEvent_matchResultId_period_idx" ON "MatchEvent"("matchResultId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "MatchEvent_matchResultId_eventIndex_key" ON "MatchEvent"("matchResultId", "eventIndex");

-- CreateIndex
CREATE INDEX "PlayerGameStat_matchResultId_teamId_idx" ON "PlayerGameStat"("matchResultId", "teamId");

-- CreateIndex
CREATE INDEX "PlayerGameStat_playerId_idx" ON "PlayerGameStat"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerGameStat_matchResultId_playerId_key" ON "PlayerGameStat"("matchResultId", "playerId");

-- CreateIndex
CREATE INDEX "TeamGameStat_matchResultId_idx" ON "TeamGameStat"("matchResultId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamGameStat_matchResultId_teamId_key" ON "TeamGameStat"("matchResultId", "teamId");
