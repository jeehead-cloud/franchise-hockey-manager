-- F26 scouting audit/lifecycle compatibility additions.
-- SQLite stores Prisma enums as TEXT, so audit enum additions require no DDL.
ALTER TABLE "Scout" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Scout" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'COMMISSIONER';
ALTER TABLE "Scout" ADD COLUMN "createdBySource" TEXT;

CREATE INDEX "Scout_status_idx" ON "Scout"("status");
