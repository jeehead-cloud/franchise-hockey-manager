-- F19: NHL Playoffs — PlayoffSeries, bracket metadata, Match playoff links

ALTER TABLE "CompetitionStage" ADD COLUMN "bracketSeed" TEXT;
ALTER TABLE "CompetitionStage" ADD COLUMN "bracketHash" TEXT;
ALTER TABLE "CompetitionStage" ADD COLUMN "bracketVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CompetitionStage" ADD COLUMN "bracketGeneratedAt" DATETIME;
ALTER TABLE "CompetitionStage" ADD COLUMN "championParticipantId" TEXT;
ALTER TABLE "CompetitionStage" ADD COLUMN "championTeamNameSnapshot" TEXT;
ALTER TABLE "CompetitionStage" ADD COLUMN "championSeed" INTEGER;
ALTER TABLE "CompetitionStage" ADD COLUMN "championshipSeriesId" TEXT;
CREATE INDEX "CompetitionStage_championParticipantId_idx" ON "CompetitionStage"("championParticipantId");

CREATE TABLE "PlayoffSeries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionStageId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "roundName" TEXT NOT NULL,
    "seriesOrder" INTEGER NOT NULL,
    "bracketSlot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "participant1Id" TEXT NOT NULL,
    "participant2Id" TEXT NOT NULL,
    "participant1Seed" INTEGER NOT NULL,
    "participant2Seed" INTEGER NOT NULL,
    "participant1NameSnapshot" TEXT NOT NULL,
    "participant2NameSnapshot" TEXT NOT NULL,
    "participant1Wins" INTEGER NOT NULL DEFAULT 0,
    "participant2Wins" INTEGER NOT NULL DEFAULT 0,
    "winsRequired" INTEGER NOT NULL,
    "homeAdvantageParticipantId" TEXT NOT NULL,
    "homePatternText" TEXT NOT NULL,
    "winnerParticipantId" TEXT,
    "nextSeriesId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayoffSeries_competitionStageId_fkey" FOREIGN KEY ("competitionStageId") REFERENCES "CompetitionStage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PlayoffSeries_competitionStageId_bracketSlot_key" ON "PlayoffSeries"("competitionStageId", "bracketSlot");
CREATE UNIQUE INDEX "PlayoffSeries_competitionStageId_roundNumber_seriesOrder_key" ON "PlayoffSeries"("competitionStageId", "roundNumber", "seriesOrder");
CREATE INDEX "PlayoffSeries_competitionStageId_roundNumber_idx" ON "PlayoffSeries"("competitionStageId", "roundNumber");
CREATE INDEX "PlayoffSeries_winnerParticipantId_idx" ON "PlayoffSeries"("winnerParticipantId");
CREATE INDEX "PlayoffSeries_status_idx" ON "PlayoffSeries"("status");

-- Redefine Match to add playoff fields
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
    "playoffSeriesId" TEXT,
    "playoffGameNumber" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_competitionEditionId_fkey" FOREIGN KEY ("competitionEditionId") REFERENCES "CompetitionEdition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_competitionStageId_fkey" FOREIGN KEY ("competitionStageId") REFERENCES "CompetitionStage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_playoffSeriesId_fkey" FOREIGN KEY ("playoffSeriesId") REFERENCES "PlayoffSeries" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Match" (
    "id", "homeTeamId", "awayTeamId", "competitionEditionId", "competitionStageId",
    "status", "scheduledAt", "currentResultId", "latestSimulationAttemptNumber",
    "source", "createdBySource", "rulesJson", "competitionRoundNumber", "competitionSlotNumber",
    "scheduleKey", "scheduleOrder", "competitionRulesHash", "createdAt", "updatedAt"
)
SELECT
    "id", "homeTeamId", "awayTeamId", "competitionEditionId", "competitionStageId",
    "status", "scheduledAt", "currentResultId", "latestSimulationAttemptNumber",
    "source", "createdBySource", "rulesJson", "competitionRoundNumber", "competitionSlotNumber",
    "scheduleKey", "scheduleOrder", "competitionRulesHash", "createdAt", "updatedAt"
FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
CREATE UNIQUE INDEX "Match_competitionStageId_scheduleKey_key" ON "Match"("competitionStageId", "scheduleKey");
CREATE UNIQUE INDEX "Match_playoffSeriesId_playoffGameNumber_key" ON "Match"("playoffSeriesId", "playoffGameNumber");
CREATE INDEX "Match_homeTeamId_idx" ON "Match"("homeTeamId");
CREATE INDEX "Match_awayTeamId_idx" ON "Match"("awayTeamId");
CREATE INDEX "Match_competitionEditionId_idx" ON "Match"("competitionEditionId");
CREATE INDEX "Match_competitionStageId_idx" ON "Match"("competitionStageId");
CREATE INDEX "Match_competitionStageId_scheduleOrder_idx" ON "Match"("competitionStageId", "scheduleOrder");
CREATE INDEX "Match_competitionStageId_status_idx" ON "Match"("competitionStageId", "status");
CREATE INDEX "Match_playoffSeriesId_idx" ON "Match"("playoffSeriesId");
CREATE INDEX "Match_status_idx" ON "Match"("status");
CREATE INDEX "Match_scheduledAt_idx" ON "Match"("scheduledAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
