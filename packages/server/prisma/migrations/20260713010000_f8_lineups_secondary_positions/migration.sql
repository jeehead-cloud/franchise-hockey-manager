-- CreateTable
CREATE TABLE "PlayerSecondaryPosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerSecondaryPosition_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamLineup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeamLineup_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LineupAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lineupId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LineupAssignment_lineupId_fkey" FOREIGN KEY ("lineupId") REFERENCES "TeamLineup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LineupAssignment_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerSecondaryPosition_playerId_position_key" ON "PlayerSecondaryPosition"("playerId", "position");

-- CreateIndex
CREATE INDEX "PlayerSecondaryPosition_position_idx" ON "PlayerSecondaryPosition"("position");

-- CreateIndex
CREATE UNIQUE INDEX "TeamLineup_teamId_key" ON "TeamLineup"("teamId");

-- CreateIndex
CREATE INDEX "LineupAssignment_playerId_idx" ON "LineupAssignment"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "LineupAssignment_lineupId_slot_key" ON "LineupAssignment"("lineupId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "LineupAssignment_lineupId_playerId_key" ON "LineupAssignment"("lineupId", "playerId");
