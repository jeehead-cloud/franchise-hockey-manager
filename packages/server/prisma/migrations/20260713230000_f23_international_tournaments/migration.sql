-- F23: International tournaments — edition metadata, Match group key, TournamentMedalResult

ALTER TABLE "CompetitionEdition" ADD COLUMN "tournamentTemplateKey" TEXT;
ALTER TABLE "CompetitionEdition" ADD COLUMN "tournamentTemplateText" TEXT;
ALTER TABLE "CompetitionEdition" ADD COLUMN "tournamentTemplateHash" TEXT;
ALTER TABLE "CompetitionEdition" ADD COLUMN "tournamentBaseSeed" TEXT;
ALTER TABLE "CompetitionEdition" ADD COLUMN "tournamentScheduleHash" TEXT;
ALTER TABLE "CompetitionEdition" ADD COLUMN "tournamentBracketHash" TEXT;
ALTER TABLE "CompetitionEdition" ADD COLUMN "tournamentResultHash" TEXT;
ALTER TABLE "CompetitionEdition" ADD COLUMN "tournamentPreparedAt" DATETIME;
CREATE INDEX "CompetitionEdition_tournamentTemplateKey_idx" ON "CompetitionEdition"("tournamentTemplateKey");

ALTER TABLE "Match" ADD COLUMN "tournamentGroupKey" TEXT;
CREATE INDEX "Match_competitionStageId_tournamentGroupKey_idx" ON "Match"("competitionStageId", "tournamentGroupKey");

CREATE TABLE "TournamentMedalResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionEditionId" TEXT NOT NULL,
    "competitionStageId" TEXT,
    "medalType" TEXT NOT NULL,
    "competitionParticipantId" TEXT NOT NULL,
    "nationalTeamEditionId" TEXT,
    "teamNameSnapshot" TEXT NOT NULL,
    "countryNameSnapshot" TEXT NOT NULL,
    "sourceMatchId" TEXT,
    "finalPlacement" INTEGER NOT NULL,
    "resultHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TournamentMedalResult_competitionEditionId_fkey" FOREIGN KEY ("competitionEditionId") REFERENCES "CompetitionEdition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TournamentMedalResult_competitionStageId_fkey" FOREIGN KEY ("competitionStageId") REFERENCES "CompetitionStage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TournamentMedalResult_nationalTeamEditionId_fkey" FOREIGN KEY ("nationalTeamEditionId") REFERENCES "NationalTeamEdition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TournamentMedalResult_sourceMatchId_fkey" FOREIGN KEY ("sourceMatchId") REFERENCES "Match" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TournamentMedalResult_competitionEditionId_medalType_key" ON "TournamentMedalResult"("competitionEditionId", "medalType");
CREATE UNIQUE INDEX "TournamentMedalResult_competitionEditionId_competitionParticipantId_key" ON "TournamentMedalResult"("competitionEditionId", "competitionParticipantId");
CREATE INDEX "TournamentMedalResult_competitionEditionId_idx" ON "TournamentMedalResult"("competitionEditionId");
CREATE INDEX "TournamentMedalResult_competitionStageId_idx" ON "TournamentMedalResult"("competitionStageId");
CREATE INDEX "TournamentMedalResult_competitionParticipantId_idx" ON "TournamentMedalResult"("competitionParticipantId");
CREATE INDEX "TournamentMedalResult_nationalTeamEditionId_idx" ON "TournamentMedalResult"("nationalTeamEditionId");
CREATE INDEX "TournamentMedalResult_sourceMatchId_idx" ON "TournamentMedalResult"("sourceMatchId");
CREATE INDEX "TournamentMedalResult_medalType_idx" ON "TournamentMedalResult"("medalType");
