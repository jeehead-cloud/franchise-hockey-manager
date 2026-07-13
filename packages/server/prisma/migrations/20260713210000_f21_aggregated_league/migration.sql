-- AlterTable
ALTER TABLE "CompetitionStage" ADD COLUMN "currentAggregatedRunId" TEXT;
ALTER TABLE "CompetitionStage" ADD COLUMN "simulationModeSnapshot" TEXT;

-- CreateTable
CREATE TABLE "AggregatedSeasonRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionEditionId" TEXT NOT NULL,
    "competitionStageId" TEXT NOT NULL,
    "runVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "seed" TEXT NOT NULL,
    "configSnapshotText" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "inputSnapshotText" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "balanceVersionId" TEXT,
    "balanceHash" TEXT,
    "scheduleHash" TEXT NOT NULL,
    "resultHash" TEXT,
    "anomaliesText" TEXT NOT NULL DEFAULT '[]',
    "totalGames" INTEGER NOT NULL DEFAULT 0,
    "completedGames" INTEGER NOT NULL DEFAULT 0,
    "progress" REAL NOT NULL DEFAULT 0,
    "currentRound" INTEGER,
    "currentScheduleOrder" INTEGER,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "supersedesRunId" TEXT,
    "supersededByRunId" TEXT,
    "errorMessage" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "failedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AggregatedSeasonRun_competitionEditionId_fkey" FOREIGN KEY ("competitionEditionId") REFERENCES "CompetitionEdition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AggregatedSeasonRun_competitionStageId_fkey" FOREIGN KEY ("competitionStageId") REFERENCES "CompetitionStage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AggregatedMatchSummary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionEditionId" TEXT NOT NULL,
    "competitionStageId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "scheduleKey" TEXT NOT NULL,
    "scheduleOrder" INTEGER NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "slotNumber" INTEGER NOT NULL,
    "homeCompetitionParticipantId" TEXT NOT NULL,
    "awayCompetitionParticipantId" TEXT NOT NULL,
    "homeTeamNameSnapshot" TEXT NOT NULL,
    "awayTeamNameSnapshot" TEXT NOT NULL,
    "homeScore" INTEGER NOT NULL,
    "awayScore" INTEGER NOT NULL,
    "decisionType" TEXT NOT NULL,
    "homePoints" INTEGER NOT NULL,
    "awayPoints" INTEGER NOT NULL,
    "homeShots" INTEGER NOT NULL DEFAULT 0,
    "awayShots" INTEGER NOT NULL DEFAULT 0,
    "homeSaves" INTEGER NOT NULL DEFAULT 0,
    "awaySaves" INTEGER NOT NULL DEFAULT 0,
    "homePenalties" INTEGER NOT NULL DEFAULT 0,
    "awayPenalties" INTEGER NOT NULL DEFAULT 0,
    "homePim" INTEGER NOT NULL DEFAULT 0,
    "awayPim" INTEGER NOT NULL DEFAULT 0,
    "homePpOpportunities" INTEGER NOT NULL DEFAULT 0,
    "awayPpOpportunities" INTEGER NOT NULL DEFAULT 0,
    "homePpGoals" INTEGER NOT NULL DEFAULT 0,
    "awayPpGoals" INTEGER NOT NULL DEFAULT 0,
    "homePossessionEstimate" REAL NOT NULL DEFAULT 0.5,
    "awayPossessionEstimate" REAL NOT NULL DEFAULT 0.5,
    "seed" TEXT NOT NULL,
    "resultHash" TEXT NOT NULL,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AggregatedMatchSummary_competitionStageId_fkey" FOREIGN KEY ("competitionStageId") REFERENCES "CompetitionStage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AggregatedMatchSummary_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AggregatedSeasonRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AggregatedSeasonRun_competitionStageId_status_idx" ON "AggregatedSeasonRun"("competitionStageId", "status");

-- CreateIndex
CREATE INDEX "AggregatedSeasonRun_competitionStageId_isCurrent_idx" ON "AggregatedSeasonRun"("competitionStageId", "isCurrent");

-- CreateIndex
CREATE INDEX "AggregatedSeasonRun_inputHash_idx" ON "AggregatedSeasonRun"("inputHash");

-- CreateIndex
CREATE INDEX "AggregatedSeasonRun_configHash_idx" ON "AggregatedSeasonRun"("configHash");

-- CreateIndex
CREATE INDEX "AggregatedSeasonRun_resultHash_idx" ON "AggregatedSeasonRun"("resultHash");

-- CreateIndex
CREATE UNIQUE INDEX "AggregatedSeasonRun_competitionStageId_runVersion_key" ON "AggregatedSeasonRun"("competitionStageId", "runVersion");

-- CreateIndex
CREATE INDEX "AggregatedMatchSummary_competitionStageId_scheduleOrder_idx" ON "AggregatedMatchSummary"("competitionStageId", "scheduleOrder");

-- CreateIndex
CREATE INDEX "AggregatedMatchSummary_runId_scheduleOrder_idx" ON "AggregatedMatchSummary"("runId", "scheduleOrder");

-- CreateIndex
CREATE INDEX "AggregatedMatchSummary_resultHash_idx" ON "AggregatedMatchSummary"("resultHash");

-- CreateIndex
CREATE UNIQUE INDEX "AggregatedMatchSummary_runId_scheduleKey_key" ON "AggregatedMatchSummary"("runId", "scheduleKey");

