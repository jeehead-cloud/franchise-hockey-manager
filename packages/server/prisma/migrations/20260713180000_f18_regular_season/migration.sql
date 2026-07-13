-- F18: NHL Regular Season — schedule metadata, competition match placement, final snapshots

-- AlterTable CompetitionStage
ALTER TABLE "CompetitionStage" ADD COLUMN "scheduleStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "CompetitionStage" ADD COLUMN "scheduleSeed" TEXT;
ALTER TABLE "CompetitionStage" ADD COLUMN "scheduleHash" TEXT;
ALTER TABLE "CompetitionStage" ADD COLUMN "scheduleVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CompetitionStage" ADD COLUMN "scheduleGeneratedAt" DATETIME;
ALTER TABLE "CompetitionStage" ADD COLUMN "simulationStartedAt" DATETIME;
ALTER TABLE "CompetitionStage" ADD COLUMN "completedAt" DATETIME;
CREATE INDEX "CompetitionStage_status_idx" ON "CompetitionStage"("status");

-- Redefine Match to add schedule fields + unique (competitionStageId, scheduleKey)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "competitionEditionId" TEXT,
    "competitionStageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "scheduledAt" DATETIME,
    "currentResultId" TEXT,
    "latestSimulationAttemptNumber" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdBySource" TEXT,
    "rulesJson" TEXT,
    "competitionRoundNumber" INTEGER,
    "competitionSlotNumber" INTEGER,
    "scheduleKey" TEXT,
    "scheduleOrder" INTEGER,
    "competitionRulesHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_competitionEditionId_fkey" FOREIGN KEY ("competitionEditionId") REFERENCES "CompetitionEdition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_competitionStageId_fkey" FOREIGN KEY ("competitionStageId") REFERENCES "CompetitionStage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Match" (
    "id", "homeTeamId", "awayTeamId", "competitionEditionId", "competitionStageId",
    "status", "scheduledAt", "currentResultId", "latestSimulationAttemptNumber",
    "source", "createdBySource", "rulesJson", "createdAt", "updatedAt"
)
SELECT
    "id", "homeTeamId", "awayTeamId", "competitionEditionId", "competitionStageId",
    "status", "scheduledAt", "currentResultId", "latestSimulationAttemptNumber",
    "source", "createdBySource", "rulesJson", "createdAt", "updatedAt"
FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
CREATE UNIQUE INDEX "Match_competitionStageId_scheduleKey_key" ON "Match"("competitionStageId", "scheduleKey");
CREATE INDEX "Match_homeTeamId_idx" ON "Match"("homeTeamId");
CREATE INDEX "Match_awayTeamId_idx" ON "Match"("awayTeamId");
CREATE INDEX "Match_competitionEditionId_idx" ON "Match"("competitionEditionId");
CREATE INDEX "Match_competitionStageId_idx" ON "Match"("competitionStageId");
CREATE INDEX "Match_competitionStageId_scheduleOrder_idx" ON "Match"("competitionStageId", "scheduleOrder");
CREATE INDEX "Match_competitionStageId_status_idx" ON "Match"("competitionStageId", "status");
CREATE INDEX "Match_status_idx" ON "Match"("status");
CREATE INDEX "Match_scheduledAt_idx" ON "Match"("scheduledAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateTable
CREATE TABLE "CompetitionStageStanding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionStageId" TEXT NOT NULL,
    "competitionParticipantId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamNameSnapshot" TEXT NOT NULL,
    "gamesPlayed" INTEGER NOT NULL,
    "regulationWins" INTEGER NOT NULL,
    "overtimeWins" INTEGER NOT NULL,
    "shootoutWins" INTEGER NOT NULL,
    "regulationLosses" INTEGER NOT NULL,
    "overtimeLosses" INTEGER NOT NULL,
    "shootoutLosses" INTEGER NOT NULL,
    "ties" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "goalsFor" INTEGER NOT NULL,
    "goalsAgainst" INTEGER NOT NULL,
    "goalDifference" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "pointsPercentage" REAL NOT NULL,
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "tiebreakerSummaryText" TEXT NOT NULL DEFAULT '',
    "statisticsJson" TEXT NOT NULL DEFAULT '{}',
    "snapshotHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitionStageStanding_competitionStageId_fkey" FOREIGN KEY ("competitionStageId") REFERENCES "CompetitionStage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CompetitionStageStanding_competitionStageId_competitionParticipantId_key" ON "CompetitionStageStanding"("competitionStageId", "competitionParticipantId");
CREATE UNIQUE INDEX "CompetitionStageStanding_competitionStageId_rank_key" ON "CompetitionStageStanding"("competitionStageId", "rank");
CREATE INDEX "CompetitionStageStanding_competitionStageId_qualified_idx" ON "CompetitionStageStanding"("competitionStageId", "qualified");

-- CreateTable
CREATE TABLE "CompetitionStageTeamStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionStageId" TEXT NOT NULL,
    "competitionParticipantId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamNameSnapshot" TEXT NOT NULL,
    "gamesPlayed" INTEGER NOT NULL,
    "goals" INTEGER NOT NULL,
    "goalsAgainst" INTEGER NOT NULL,
    "shotsOnGoal" INTEGER NOT NULL,
    "shotAttempts" INTEGER NOT NULL DEFAULT 0,
    "penalties" INTEGER NOT NULL,
    "penaltyMinutes" INTEGER NOT NULL,
    "powerPlayGoals" INTEGER NOT NULL,
    "powerPlayOpportunities" INTEGER NOT NULL DEFAULT 0,
    "shortHandedGoals" INTEGER NOT NULL,
    "shootoutAttempts" INTEGER NOT NULL DEFAULT 0,
    "shootoutGoals" INTEGER NOT NULL DEFAULT 0,
    "shootingPercentage" REAL,
    "powerPlayPercentage" REAL,
    "penaltyKillPercentage" REAL,
    "statsJson" TEXT NOT NULL DEFAULT '{}',
    "snapshotHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitionStageTeamStat_competitionStageId_fkey" FOREIGN KEY ("competitionStageId") REFERENCES "CompetitionStage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CompetitionStageTeamStat_competitionStageId_teamId_key" ON "CompetitionStageTeamStat"("competitionStageId", "teamId");
CREATE INDEX "CompetitionStageTeamStat_competitionStageId_idx" ON "CompetitionStageTeamStat"("competitionStageId");

-- CreateTable
CREATE TABLE "CompetitionStagePlayerStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionStageId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamNameSnapshot" TEXT NOT NULL,
    "firstNameSnapshot" TEXT NOT NULL,
    "lastNameSnapshot" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "isGoalie" BOOLEAN NOT NULL DEFAULT false,
    "gamesPlayed" INTEGER NOT NULL,
    "goals" INTEGER NOT NULL,
    "assists" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "shotsOnGoal" INTEGER NOT NULL,
    "penaltyMinutes" INTEGER NOT NULL,
    "powerPlayGoals" INTEGER NOT NULL,
    "shortHandedGoals" INTEGER NOT NULL,
    "shootoutAttempts" INTEGER NOT NULL DEFAULT 0,
    "shootoutGoals" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "shotsAgainst" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "goalsAgainst" INTEGER NOT NULL DEFAULT 0,
    "shutouts" INTEGER NOT NULL DEFAULT 0,
    "savePercentage" REAL,
    "shootingPercentage" REAL,
    "statsJson" TEXT NOT NULL DEFAULT '{}',
    "snapshotHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitionStagePlayerStat_competitionStageId_fkey" FOREIGN KEY ("competitionStageId") REFERENCES "CompetitionStage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CompetitionStagePlayerStat_competitionStageId_playerId_key" ON "CompetitionStagePlayerStat"("competitionStageId", "playerId");
CREATE INDEX "CompetitionStagePlayerStat_competitionStageId_isGoalie_idx" ON "CompetitionStagePlayerStat"("competitionStageId", "isGoalie");
CREATE INDEX "CompetitionStagePlayerStat_competitionStageId_points_idx" ON "CompetitionStagePlayerStat"("competitionStageId", "points");
