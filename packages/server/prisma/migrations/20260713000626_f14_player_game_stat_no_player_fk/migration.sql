-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlayerGameStat" (
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
    CONSTRAINT "PlayerGameStat_matchResultId_fkey" FOREIGN KEY ("matchResultId") REFERENCES "MatchResult" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PlayerGameStat" ("assists", "createdAt", "goals", "id", "matchResultId", "penaltyMinutes", "playerId", "points", "position", "powerPlayGoals", "shootoutAttempts", "shootoutGoals", "shortHandedGoals", "shotsOnGoal", "statsJson", "teamId") SELECT "assists", "createdAt", "goals", "id", "matchResultId", "penaltyMinutes", "playerId", "points", "position", "powerPlayGoals", "shootoutAttempts", "shootoutGoals", "shortHandedGoals", "shotsOnGoal", "statsJson", "teamId" FROM "PlayerGameStat";
DROP TABLE "PlayerGameStat";
ALTER TABLE "new_PlayerGameStat" RENAME TO "PlayerGameStat";
CREATE INDEX "PlayerGameStat_matchResultId_teamId_idx" ON "PlayerGameStat"("matchResultId", "teamId");
CREATE INDEX "PlayerGameStat_playerId_idx" ON "PlayerGameStat"("playerId");
CREATE UNIQUE INDEX "PlayerGameStat_matchResultId_playerId_key" ON "PlayerGameStat"("matchResultId", "playerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
