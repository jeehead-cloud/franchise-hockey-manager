-- F26 scouting audit/lifecycle compatibility additions.
-- SQLite stores Prisma enums as TEXT, so audit enum additions require no DDL.
ALTER TABLE "Scout" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Scout" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'COMMISSIONER';
ALTER TABLE "Scout" ADD COLUMN "createdBySource" TEXT;

CREATE INDEX "Scout_status_idx" ON "Scout"("status");

-- Backfill scouting/F2 indexes that were declared in schema.prisma after the
-- initial F26 migration was generated, so a from-scratch `migrate deploy`
-- reproduces the schema the live dev database already has. These are
-- additive index-only changes; no data is touched.
CREATE INDEX IF NOT EXISTS "Player_rosterStatus_idx" ON "Player"("rosterStatus");
CREATE INDEX IF NOT EXISTS "Player_sourceType_idx" ON "Player"("sourceType");
CREATE INDEX IF NOT EXISTS "ScoutingAssignment_configVersionId_idx" ON "ScoutingAssignment"("configVersionId");
CREATE INDEX IF NOT EXISTS "ScoutingAssignmentScout_scoutId_idx" ON "ScoutingAssignmentScout"("scoutId");
CREATE INDEX IF NOT EXISTS "ScoutingDepartmentScout_scoutId_idx" ON "ScoutingDepartmentScout"("scoutId");
CREATE INDEX IF NOT EXISTS "ScoutingObservation_assignmentId_idx" ON "ScoutingObservation"("assignmentId");
CREATE INDEX IF NOT EXISTS "ScoutingPresetVersion_configHash_idx" ON "ScoutingPresetVersion"("configHash");
CREATE INDEX IF NOT EXISTS "TeamProspectKnowledge_playerId_idx" ON "TeamProspectKnowledge"("playerId");
CREATE INDEX IF NOT EXISTS "TeamProspectWatchlistEntry_teamId_manualPriority_idx" ON "TeamProspectWatchlistEntry"("teamId", "manualPriority");
CREATE INDEX IF NOT EXISTS "TeamScoutingReport_reportHash_idx" ON "TeamScoutingReport"("reportHash");
