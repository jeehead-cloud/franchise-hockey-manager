-- CreateTable
CREATE TABLE "CompetitionArchive" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionId" TEXT NOT NULL,
    "competitionEditionId" TEXT NOT NULL,
    "worldSeasonId" TEXT NOT NULL,
    "archiveSchemaVersion" INTEGER NOT NULL,
    "archiveVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CURRENT',
    "competitionNameSnapshot" TEXT NOT NULL,
    "competitionShortNameSnapshot" TEXT,
    "editionNameSnapshot" TEXT NOT NULL,
    "worldSeasonNameSnapshot" TEXT NOT NULL,
    "competitionTypeSnapshot" TEXT NOT NULL,
    "simulationLevelSnapshot" TEXT,
    "rulesSnapshotText" TEXT NOT NULL,
    "rulesHash" TEXT NOT NULL,
    "engineVersionsText" TEXT NOT NULL,
    "balanceVersionsText" TEXT NOT NULL,
    "participantCount" INTEGER NOT NULL,
    "stageCount" INTEGER NOT NULL,
    "matchCount" INTEGER NOT NULL,
    "championParticipantSourceId" TEXT,
    "championTeamSourceId" TEXT,
    "championNameSnapshot" TEXT,
    "championShortNameSnapshot" TEXT,
    "archiveHash" TEXT NOT NULL,
    "sourceSnapshotHash" TEXT NOT NULL,
    "canonicalSnapshotText" TEXT NOT NULL DEFAULT '{}',
    "archivedAt" DATETIME NOT NULL,
    "archivedBy" TEXT,
    "reason" TEXT NOT NULL,
    "supersedesArchiveId" TEXT,
    "supersededByArchiveId" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitionArchive_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CompetitionArchive_competitionEditionId_fkey" FOREIGN KEY ("competitionEditionId") REFERENCES "CompetitionEdition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CompetitionArchive_worldSeasonId_fkey" FOREIGN KEY ("worldSeasonId") REFERENCES "WorldSeason" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CompetitionArchive_supersedesArchiveId_fkey" FOREIGN KEY ("supersedesArchiveId") REFERENCES "CompetitionArchive" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArchiveParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionArchiveId" TEXT NOT NULL,
    "sourceCompetitionParticipantId" TEXT NOT NULL,
    "sourceTeamId" TEXT NOT NULL,
    "participantOrder" INTEGER NOT NULL,
    "seed" INTEGER,
    "finalStatus" TEXT NOT NULL,
    "teamNameSnapshot" TEXT NOT NULL,
    "teamShortNameSnapshot" TEXT,
    "countryNameSnapshot" TEXT,
    "leagueNameSnapshot" TEXT,
    "groupKey" TEXT,
    "qualifiedForPlayoffs" BOOLEAN NOT NULL DEFAULT false,
    "playoffSeed" INTEGER,
    "finalRegularSeasonRank" INTEGER,
    "finalPlayoffResult" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchiveParticipant_competitionArchiveId_fkey" FOREIGN KEY ("competitionArchiveId") REFERENCES "CompetitionArchive" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArchiveStage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionArchiveId" TEXT NOT NULL,
    "sourceCompetitionStageId" TEXT NOT NULL,
    "stageOrder" INTEGER NOT NULL,
    "stageNameSnapshot" TEXT NOT NULL,
    "stageType" TEXT NOT NULL,
    "finalStatus" TEXT NOT NULL,
    "configSnapshotText" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "scheduleHash" TEXT,
    "bracketHash" TEXT,
    "matchCount" INTEGER NOT NULL,
    "completedAtSnapshot" DATETIME,
    "championParticipantArchiveId" TEXT,
    "sourceStageArchiveId" TEXT,
    "snapshotHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchiveStage_competitionArchiveId_fkey" FOREIGN KEY ("competitionArchiveId") REFERENCES "CompetitionArchive" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArchiveStanding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionArchiveId" TEXT NOT NULL,
    "archiveStageId" TEXT NOT NULL,
    "archiveParticipantId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
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
    "qualified" BOOLEAN NOT NULL,
    "tiebreakerSummaryText" TEXT NOT NULL DEFAULT '',
    "sourceSnapshotHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchiveStanding_competitionArchiveId_fkey" FOREIGN KEY ("competitionArchiveId") REFERENCES "CompetitionArchive" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArchiveStanding_archiveStageId_fkey" FOREIGN KEY ("archiveStageId") REFERENCES "ArchiveStage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArchiveStanding_archiveParticipantId_fkey" FOREIGN KEY ("archiveParticipantId") REFERENCES "ArchiveParticipant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArchiveTeamStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionArchiveId" TEXT NOT NULL,
    "archiveStageId" TEXT NOT NULL,
    "archiveParticipantId" TEXT NOT NULL,
    "gamesPlayed" INTEGER NOT NULL,
    "goals" INTEGER NOT NULL,
    "goalsAgainst" INTEGER NOT NULL,
    "shots" INTEGER NOT NULL,
    "shotAttempts" INTEGER NOT NULL,
    "shootingPercentage" REAL,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "savePercentage" REAL,
    "faceoffWins" INTEGER NOT NULL DEFAULT 0,
    "faceoffPercentage" REAL,
    "possessionSeconds" INTEGER NOT NULL DEFAULT 0,
    "possessionPercentage" REAL,
    "penalties" INTEGER NOT NULL,
    "penaltyMinutes" INTEGER NOT NULL,
    "powerPlayOpportunities" INTEGER NOT NULL,
    "powerPlayGoals" INTEGER NOT NULL,
    "powerPlayPercentage" REAL,
    "penaltyKillOpportunities" INTEGER NOT NULL DEFAULT 0,
    "penaltyKills" INTEGER NOT NULL DEFAULT 0,
    "penaltyKillPercentage" REAL,
    "shortHandedGoals" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "overtimeLosses" INTEGER NOT NULL DEFAULT 0,
    "seriesWins" INTEGER NOT NULL DEFAULT 0,
    "seriesLosses" INTEGER NOT NULL DEFAULT 0,
    "statsSnapshotText" TEXT NOT NULL DEFAULT '{}',
    "sourceSnapshotHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchiveTeamStat_competitionArchiveId_fkey" FOREIGN KEY ("competitionArchiveId") REFERENCES "CompetitionArchive" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArchiveTeamStat_archiveStageId_fkey" FOREIGN KEY ("archiveStageId") REFERENCES "ArchiveStage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArchiveTeamStat_archiveParticipantId_fkey" FOREIGN KEY ("archiveParticipantId") REFERENCES "ArchiveParticipant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArchivePlayerStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionArchiveId" TEXT NOT NULL,
    "archiveStageId" TEXT NOT NULL,
    "sourcePlayerId" TEXT NOT NULL,
    "sourceTeamId" TEXT,
    "archiveParticipantId" TEXT,
    "playerNameSnapshot" TEXT NOT NULL,
    "teamNameSnapshot" TEXT,
    "positionSnapshot" TEXT NOT NULL,
    "isGoalie" BOOLEAN NOT NULL DEFAULT false,
    "gamesPlayed" INTEGER NOT NULL,
    "goals" INTEGER NOT NULL,
    "assists" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "shots" INTEGER NOT NULL,
    "shotAttempts" INTEGER NOT NULL DEFAULT 0,
    "shootingPercentage" REAL,
    "penaltyMinutes" INTEGER NOT NULL,
    "powerPlayGoals" INTEGER NOT NULL,
    "shortHandedGoals" INTEGER NOT NULL,
    "shootoutAttempts" INTEGER NOT NULL DEFAULT 0,
    "shootoutGoals" INTEGER NOT NULL DEFAULT 0,
    "goalieWins" INTEGER NOT NULL DEFAULT 0,
    "goalieLosses" INTEGER NOT NULL DEFAULT 0,
    "overtimeLosses" INTEGER NOT NULL DEFAULT 0,
    "shotsAgainst" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "goalsAgainst" INTEGER NOT NULL DEFAULT 0,
    "savePercentage" REAL,
    "shutouts" INTEGER NOT NULL DEFAULT 0,
    "statsSnapshotText" TEXT NOT NULL DEFAULT '{}',
    "sourceSnapshotHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchivePlayerStat_competitionArchiveId_fkey" FOREIGN KEY ("competitionArchiveId") REFERENCES "CompetitionArchive" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArchivePlayerStat_archiveStageId_fkey" FOREIGN KEY ("archiveStageId") REFERENCES "ArchiveStage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArchivePlayerStat_archiveParticipantId_fkey" FOREIGN KEY ("archiveParticipantId") REFERENCES "ArchiveParticipant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArchiveMatchSummary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionArchiveId" TEXT NOT NULL,
    "archiveStageId" TEXT NOT NULL,
    "sourceMatchId" TEXT NOT NULL,
    "sourceCurrentResultId" TEXT NOT NULL,
    "sourcePlayoffSeriesId" TEXT,
    "scheduleOrder" INTEGER,
    "roundNumber" INTEGER,
    "slotNumber" INTEGER,
    "gameNumber" INTEGER,
    "homeArchiveParticipantId" TEXT NOT NULL,
    "awayArchiveParticipantId" TEXT NOT NULL,
    "homeNameSnapshot" TEXT NOT NULL,
    "awayNameSnapshot" TEXT NOT NULL,
    "homeScore" INTEGER NOT NULL,
    "awayScore" INTEGER NOT NULL,
    "decisionType" TEXT NOT NULL,
    "matchStatus" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "balanceVersionSnapshot" TEXT NOT NULL,
    "resultTraceHash" TEXT NOT NULL,
    "completedAtSnapshot" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchiveMatchSummary_competitionArchiveId_fkey" FOREIGN KEY ("competitionArchiveId") REFERENCES "CompetitionArchive" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArchiveMatchSummary_archiveStageId_fkey" FOREIGN KEY ("archiveStageId") REFERENCES "ArchiveStage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArchiveMatchSummary_homeArchiveParticipantId_fkey" FOREIGN KEY ("homeArchiveParticipantId") REFERENCES "ArchiveParticipant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArchiveMatchSummary_awayArchiveParticipantId_fkey" FOREIGN KEY ("awayArchiveParticipantId") REFERENCES "ArchiveParticipant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArchiveSeries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionArchiveId" TEXT NOT NULL,
    "archiveStageId" TEXT NOT NULL,
    "sourcePlayoffSeriesId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "roundNameSnapshot" TEXT NOT NULL,
    "seriesOrder" INTEGER NOT NULL,
    "bracketSlot" TEXT NOT NULL,
    "participant1ArchiveId" TEXT NOT NULL,
    "participant2ArchiveId" TEXT NOT NULL,
    "participant1Seed" INTEGER NOT NULL,
    "participant2Seed" INTEGER NOT NULL,
    "participant1Wins" INTEGER NOT NULL,
    "participant2Wins" INTEGER NOT NULL,
    "winsRequired" INTEGER NOT NULL,
    "winnerArchiveParticipantId" TEXT,
    "homePatternSnapshotText" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAtSnapshot" DATETIME,
    "completedAtSnapshot" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchiveSeries_competitionArchiveId_fkey" FOREIGN KEY ("competitionArchiveId") REFERENCES "CompetitionArchive" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArchiveSeries_archiveStageId_fkey" FOREIGN KEY ("archiveStageId") REFERENCES "ArchiveStage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArchiveSeries_participant1ArchiveId_fkey" FOREIGN KEY ("participant1ArchiveId") REFERENCES "ArchiveParticipant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArchiveSeries_participant2ArchiveId_fkey" FOREIGN KEY ("participant2ArchiveId") REFERENCES "ArchiveParticipant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArchiveSeries_winnerArchiveParticipantId_fkey" FOREIGN KEY ("winnerArchiveParticipantId") REFERENCES "ArchiveParticipant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArchiveSeriesGame" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "archiveSeriesId" TEXT NOT NULL,
    "sourceMatchId" TEXT NOT NULL,
    "sourceCurrentResultId" TEXT NOT NULL,
    "gameNumber" INTEGER NOT NULL,
    "homeArchiveParticipantId" TEXT NOT NULL,
    "awayArchiveParticipantId" TEXT NOT NULL,
    "homeScore" INTEGER NOT NULL,
    "awayScore" INTEGER NOT NULL,
    "decisionType" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "balanceVersionIdSnapshot" TEXT,
    "seed" TEXT NOT NULL,
    "traceHash" TEXT NOT NULL,
    "completedAtSnapshot" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchiveSeriesGame_archiveSeriesId_fkey" FOREIGN KEY ("archiveSeriesId") REFERENCES "ArchiveSeries" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArchiveAward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionArchiveId" TEXT NOT NULL,
    "archiveStageId" TEXT,
    "awardType" TEXT NOT NULL,
    "awardNameSnapshot" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "archiveParticipantId" TEXT,
    "sourcePlayerId" TEXT,
    "playerNameSnapshot" TEXT,
    "teamNameSnapshot" TEXT,
    "valueNumber" REAL,
    "valueText" TEXT,
    "rank" INTEGER NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "criteriaSnapshotText" TEXT NOT NULL,
    "sourceSnapshotHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchiveAward_competitionArchiveId_fkey" FOREIGN KEY ("competitionArchiveId") REFERENCES "CompetitionArchive" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArchiveAward_archiveStageId_fkey" FOREIGN KEY ("archiveStageId") REFERENCES "ArchiveStage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArchiveAward_archiveParticipantId_fkey" FOREIGN KEY ("archiveParticipantId") REFERENCES "ArchiveParticipant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CompetitionArchive_competitionId_idx" ON "CompetitionArchive"("competitionId");

-- CreateIndex
CREATE INDEX "CompetitionArchive_worldSeasonId_idx" ON "CompetitionArchive"("worldSeasonId");

-- CreateIndex
CREATE INDEX "CompetitionArchive_isCurrent_idx" ON "CompetitionArchive"("isCurrent");

-- CreateIndex
CREATE INDEX "CompetitionArchive_status_idx" ON "CompetitionArchive"("status");

-- CreateIndex
CREATE INDEX "CompetitionArchive_archivedAt_idx" ON "CompetitionArchive"("archivedAt");

-- CreateIndex
CREATE INDEX "CompetitionArchive_championTeamSourceId_idx" ON "CompetitionArchive"("championTeamSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionArchive_competitionEditionId_archiveVersion_key" ON "CompetitionArchive"("competitionEditionId", "archiveVersion");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionArchive_competitionEditionId_archiveHash_key" ON "CompetitionArchive"("competitionEditionId", "archiveHash");

-- CreateIndex
CREATE INDEX "ArchiveParticipant_sourceTeamId_idx" ON "ArchiveParticipant"("sourceTeamId");

-- CreateIndex
CREATE INDEX "ArchiveParticipant_competitionArchiveId_qualifiedForPlayoffs_idx" ON "ArchiveParticipant"("competitionArchiveId", "qualifiedForPlayoffs");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveParticipant_competitionArchiveId_sourceCompetitionParticipantId_key" ON "ArchiveParticipant"("competitionArchiveId", "sourceCompetitionParticipantId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveParticipant_competitionArchiveId_participantOrder_key" ON "ArchiveParticipant"("competitionArchiveId", "participantOrder");

-- CreateIndex
CREATE INDEX "ArchiveStage_stageType_idx" ON "ArchiveStage"("stageType");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveStage_competitionArchiveId_sourceCompetitionStageId_key" ON "ArchiveStage"("competitionArchiveId", "sourceCompetitionStageId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveStage_competitionArchiveId_stageOrder_key" ON "ArchiveStage"("competitionArchiveId", "stageOrder");

-- CreateIndex
CREATE INDEX "ArchiveStanding_competitionArchiveId_rank_idx" ON "ArchiveStanding"("competitionArchiveId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveStanding_archiveStageId_archiveParticipantId_key" ON "ArchiveStanding"("archiveStageId", "archiveParticipantId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveStanding_archiveStageId_rank_key" ON "ArchiveStanding"("archiveStageId", "rank");

-- CreateIndex
CREATE INDEX "ArchiveTeamStat_competitionArchiveId_idx" ON "ArchiveTeamStat"("competitionArchiveId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveTeamStat_archiveStageId_archiveParticipantId_key" ON "ArchiveTeamStat"("archiveStageId", "archiveParticipantId");

-- CreateIndex
CREATE INDEX "ArchivePlayerStat_competitionArchiveId_isGoalie_idx" ON "ArchivePlayerStat"("competitionArchiveId", "isGoalie");

-- CreateIndex
CREATE INDEX "ArchivePlayerStat_competitionArchiveId_points_idx" ON "ArchivePlayerStat"("competitionArchiveId", "points");

-- CreateIndex
CREATE INDEX "ArchivePlayerStat_sourcePlayerId_idx" ON "ArchivePlayerStat"("sourcePlayerId");

-- CreateIndex
CREATE INDEX "ArchivePlayerStat_sourceTeamId_idx" ON "ArchivePlayerStat"("sourceTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchivePlayerStat_archiveStageId_sourcePlayerId_key" ON "ArchivePlayerStat"("archiveStageId", "sourcePlayerId");

-- CreateIndex
CREATE INDEX "ArchiveMatchSummary_archiveStageId_scheduleOrder_idx" ON "ArchiveMatchSummary"("archiveStageId", "scheduleOrder");

-- CreateIndex
CREATE INDEX "ArchiveMatchSummary_sourceMatchId_idx" ON "ArchiveMatchSummary"("sourceMatchId");

-- CreateIndex
CREATE INDEX "ArchiveMatchSummary_sourceCurrentResultId_idx" ON "ArchiveMatchSummary"("sourceCurrentResultId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveMatchSummary_competitionArchiveId_sourceMatchId_key" ON "ArchiveMatchSummary"("competitionArchiveId", "sourceMatchId");

-- CreateIndex
CREATE INDEX "ArchiveSeries_archiveStageId_roundNumber_seriesOrder_idx" ON "ArchiveSeries"("archiveStageId", "roundNumber", "seriesOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveSeries_competitionArchiveId_sourcePlayoffSeriesId_key" ON "ArchiveSeries"("competitionArchiveId", "sourcePlayoffSeriesId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveSeries_archiveStageId_bracketSlot_key" ON "ArchiveSeries"("archiveStageId", "bracketSlot");

-- CreateIndex
CREATE INDEX "ArchiveSeriesGame_sourceMatchId_idx" ON "ArchiveSeriesGame"("sourceMatchId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveSeriesGame_archiveSeriesId_gameNumber_key" ON "ArchiveSeriesGame"("archiveSeriesId", "gameNumber");

-- CreateIndex
CREATE INDEX "ArchiveAward_competitionArchiveId_awardType_idx" ON "ArchiveAward"("competitionArchiveId", "awardType");

-- CreateIndex
CREATE INDEX "ArchiveAward_sourcePlayerId_idx" ON "ArchiveAward"("sourcePlayerId");
