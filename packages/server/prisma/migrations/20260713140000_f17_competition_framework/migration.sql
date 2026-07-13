-- CreateTable
CREATE TABLE "CompetitionParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionEditionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "seed" INTEGER,
    "groupKey" TEXT,
    "participantOrder" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "teamNameSnapshot" TEXT NOT NULL,
    "teamShortNameSnapshot" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompetitionParticipant_competitionEditionId_fkey" FOREIGN KEY ("competitionEditionId") REFERENCES "CompetitionEdition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CompetitionParticipant_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompetitionStage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionEditionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stageType" TEXT NOT NULL,
    "stageOrder" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "configText" TEXT NOT NULL DEFAULT '{}',
    "configHash" TEXT NOT NULL DEFAULT '',
    "participantSource" TEXT NOT NULL DEFAULT 'EDITION_PARTICIPANTS',
    "sourceStageId" TEXT,
    "expectedQualifierCount" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompetitionStage_competitionEditionId_fkey" FOREIGN KEY ("competitionEditionId") REFERENCES "CompetitionEdition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CompetitionStage_sourceStageId_fkey" FOREIGN KEY ("sourceStageId") REFERENCES "CompetitionStage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StageParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionStageId" TEXT NOT NULL,
    "competitionParticipantId" TEXT NOT NULL,
    "seed" INTEGER,
    "groupKey" TEXT,
    "stageOrder" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StageParticipant_competitionStageId_fkey" FOREIGN KEY ("competitionStageId") REFERENCES "CompetitionStage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StageParticipant_competitionParticipantId_fkey" FOREIGN KEY ("competitionParticipantId") REFERENCES "CompetitionParticipant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Competition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "type" TEXT NOT NULL,
    "simulationLevel" TEXT,
    "countryId" TEXT,
    "leagueId" TEXT,
    "defaultRulesJson" TEXT,
    "externalId" TEXT,
    "sourceDataset" TEXT,
    "sourceUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Competition_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Competition_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Competition" ("createdAt", "externalId", "id", "name", "shortName", "simulationLevel", "sourceDataset", "sourceUpdatedAt", "type", "updatedAt") SELECT "createdAt", "externalId", "id", "name", "shortName", "simulationLevel", "sourceDataset", "sourceUpdatedAt", "type", "updatedAt" FROM "Competition";
DROP TABLE "Competition";
ALTER TABLE "new_Competition" RENAME TO "Competition";
CREATE INDEX "Competition_countryId_idx" ON "Competition"("countryId");
CREATE INDEX "Competition_leagueId_idx" ON "Competition"("leagueId");
CREATE UNIQUE INDEX "Competition_name_type_key" ON "Competition"("name", "type");
CREATE UNIQUE INDEX "Competition_sourceDataset_externalId_key" ON "Competition"("sourceDataset", "externalId");
CREATE TABLE "new_CompetitionEdition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionId" TEXT NOT NULL,
    "worldSeasonId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "editionNumber" INTEGER,
    "rulesSnapshotText" TEXT NOT NULL DEFAULT '{}',
    "rulesHash" TEXT NOT NULL DEFAULT '',
    "preparedAt" DATETIME,
    "activatedAt" DATETIME,
    "completedAt" DATETIME,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompetitionEdition_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CompetitionEdition_worldSeasonId_fkey" FOREIGN KEY ("worldSeasonId") REFERENCES "WorldSeason" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CompetitionEdition" ("competitionId", "createdAt", "displayName", "id", "status", "updatedAt", "worldSeasonId") SELECT "competitionId", "createdAt", "displayName", "id", "status", "updatedAt", "worldSeasonId" FROM "CompetitionEdition";
DROP TABLE "CompetitionEdition";
ALTER TABLE "new_CompetitionEdition" RENAME TO "CompetitionEdition";
CREATE INDEX "CompetitionEdition_worldSeasonId_idx" ON "CompetitionEdition"("worldSeasonId");
CREATE INDEX "CompetitionEdition_status_idx" ON "CompetitionEdition"("status");
CREATE UNIQUE INDEX "CompetitionEdition_competitionId_worldSeasonId_key" ON "CompetitionEdition"("competitionId", "worldSeasonId");
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_competitionEditionId_fkey" FOREIGN KEY ("competitionEditionId") REFERENCES "CompetitionEdition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_competitionStageId_fkey" FOREIGN KEY ("competitionStageId") REFERENCES "CompetitionStage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Match" ("awayTeamId", "competitionEditionId", "createdAt", "createdBySource", "currentResultId", "homeTeamId", "id", "latestSimulationAttemptNumber", "rulesJson", "scheduledAt", "source", "status", "updatedAt") SELECT "awayTeamId", "competitionEditionId", "createdAt", "createdBySource", "currentResultId", "homeTeamId", "id", "latestSimulationAttemptNumber", "rulesJson", "scheduledAt", "source", "status", "updatedAt" FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
CREATE INDEX "Match_homeTeamId_idx" ON "Match"("homeTeamId");
CREATE INDEX "Match_awayTeamId_idx" ON "Match"("awayTeamId");
CREATE INDEX "Match_competitionEditionId_idx" ON "Match"("competitionEditionId");
CREATE INDEX "Match_competitionStageId_idx" ON "Match"("competitionStageId");
CREATE INDEX "Match_status_idx" ON "Match"("status");
CREATE INDEX "Match_scheduledAt_idx" ON "Match"("scheduledAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CompetitionParticipant_teamId_idx" ON "CompetitionParticipant"("teamId");

-- CreateIndex
CREATE INDEX "CompetitionParticipant_status_idx" ON "CompetitionParticipant"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionParticipant_competitionEditionId_teamId_key" ON "CompetitionParticipant"("competitionEditionId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionParticipant_competitionEditionId_participantOrder_key" ON "CompetitionParticipant"("competitionEditionId", "participantOrder");

-- CreateIndex
CREATE INDEX "CompetitionStage_competitionEditionId_idx" ON "CompetitionStage"("competitionEditionId");

-- CreateIndex
CREATE INDEX "CompetitionStage_stageType_idx" ON "CompetitionStage"("stageType");

-- CreateIndex
CREATE INDEX "CompetitionStage_sourceStageId_idx" ON "CompetitionStage"("sourceStageId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionStage_competitionEditionId_stageOrder_key" ON "CompetitionStage"("competitionEditionId", "stageOrder");

-- CreateIndex
CREATE INDEX "StageParticipant_competitionParticipantId_idx" ON "StageParticipant"("competitionParticipantId");

-- CreateIndex
CREATE UNIQUE INDEX "StageParticipant_competitionStageId_competitionParticipantId_key" ON "StageParticipant"("competitionStageId", "competitionParticipantId");

-- CreateIndex
CREATE UNIQUE INDEX "StageParticipant_competitionStageId_stageOrder_key" ON "StageParticipant"("competitionStageId", "stageOrder");

-- Backfill existing editions with simplified SIMPLE_LEAGUE development preset (not NHL).
UPDATE "CompetitionEdition"
SET
  "rulesSnapshotText" = '{"format":"LEAGUE_AND_PLAYOFF","matchRules":{"overtimeDurationSeconds":300,"overtimeEnabled":true,"overtimeSkaterCount":3,"shootoutEnabled":true,"shootoutRounds":3,"tiesAllowed":false},"points":{"overtimeLoss":1,"overtimeWin":2,"regulationLoss":0,"regulationWin":2,"shootoutLoss":1,"shootoutWin":2,"tie":1},"qualification":{"qualifiers":4,"wildcards":0},"schemaVersion":1,"series":{"homePattern":"2-2-1-1-1","reseeding":false,"winsRequired":4},"tiebreakers":["POINTS","REGULATION_WINS","TOTAL_WINS","GOAL_DIFFERENCE","GOALS_FOR","HEAD_TO_HEAD","RANDOM_DRAW"]}',
  "rulesHash" = '2f1be66ab0fc72aedba18ed840beb8cfd58053062bf3228b7c3899f569941d54'
WHERE "rulesHash" = '' OR "rulesSnapshotText" = '{}';

UPDATE "Competition"
SET "defaultRulesJson" = '{"format":"LEAGUE_AND_PLAYOFF","matchRules":{"overtimeDurationSeconds":300,"overtimeEnabled":true,"overtimeSkaterCount":3,"shootoutEnabled":true,"shootoutRounds":3,"tiesAllowed":false},"points":{"overtimeLoss":1,"overtimeWin":2,"regulationLoss":0,"regulationWin":2,"shootoutLoss":1,"shootoutWin":2,"tie":1},"qualification":{"qualifiers":4,"wildcards":0},"schemaVersion":1,"series":{"homePattern":"2-2-1-1-1","reseeding":false,"winsRequired":4},"tiebreakers":["POINTS","REGULATION_WINS","TOTAL_WINS","GOAL_DIFFERENCE","GOALS_FOR","HEAD_TO_HEAD","RANDOM_DRAW"]}'
WHERE "defaultRulesJson" IS NULL;

