-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "conference" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Team_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "nationality" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "startTotal" REAL NOT NULL,
    "devRate" REAL NOT NULL,
    "risk" REAL NOT NULL,
    "bonusPotential" REAL NOT NULL,
    "currentDevState" REAL NOT NULL,
    "stabPlus" REAL NOT NULL,
    "stabMinus" REAL NOT NULL,
    "currentStabState" REAL NOT NULL,
    "ageAdj" REAL NOT NULL,
    "currTotal" REAL NOT NULL,
    "offensePct" REAL NOT NULL,
    "defencePct" REAL NOT NULL,
    "offence" REAL NOT NULL,
    "defence" REAL NOT NULL,
    "sth" REAL,
    "sho" REAL,
    "pas" REAL,
    "str" REAL,
    "spd" REAL,
    "bal" REAL,
    "agg" REAL,
    "ofAw" REAL,
    "defAw" REAL,
    "goalieAttributes" TEXT,
    "preferredCoachingStyle" TEXT NOT NULL,
    "preferredTactics" TEXT NOT NULL,
    "personality" TEXT NOT NULL,
    "heroRating" INTEGER NOT NULL,
    "nationalTeam" INTEGER NOT NULL,
    "role" TEXT,
    "roleRating" REAL,
    "curOverTot" REAL,
    "overPot" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "League_name_key" ON "League"("name");

-- CreateIndex
CREATE INDEX "Team_leagueId_idx" ON "Team"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_leagueId_city_name_key" ON "Team"("leagueId", "city", "name");

-- CreateIndex
CREATE INDEX "Player_teamId_idx" ON "Player"("teamId");

-- CreateIndex
CREATE INDEX "Player_position_idx" ON "Player"("position");
