-- AlterTable
ALTER TABLE "Player" ADD COLUMN "developmentRate" REAL;
ALTER TABLE "Player" ADD COLUMN "developmentRisk" REAL;
ALTER TABLE "Player" ADD COLUMN "heroRating" INTEGER;
ALTER TABLE "Player" ADD COLUMN "personality" TEXT;
ALTER TABLE "Player" ADD COLUMN "potentialCeiling" INTEGER;
ALTER TABLE "Player" ADD COLUMN "potentialFloor" INTEGER;
ALTER TABLE "Player" ADD COLUMN "preferredCoachingStyle" TEXT;
ALTER TABLE "Player" ADD COLUMN "preferredTactics" TEXT;
ALTER TABLE "Player" ADD COLUMN "publicPotentialEstimate" TEXT;
ALTER TABLE "Player" ADD COLUMN "stability" INTEGER;

-- CreateTable
CREATE TABLE "SkaterAttributes" (
    "playerId" TEXT NOT NULL PRIMARY KEY,
    "stickhandling" INTEGER NOT NULL,
    "shooting" INTEGER NOT NULL,
    "passing" INTEGER NOT NULL,
    "strength" INTEGER NOT NULL,
    "speed" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "aggression" INTEGER NOT NULL,
    "offensiveAwareness" INTEGER NOT NULL,
    "defensiveAwareness" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SkaterAttributes_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GoalieAttributes" (
    "playerId" TEXT NOT NULL PRIMARY KEY,
    "reflexes" INTEGER NOT NULL,
    "positioning" INTEGER NOT NULL,
    "reboundControl" INTEGER NOT NULL,
    "glove" INTEGER NOT NULL,
    "blocker" INTEGER NOT NULL,
    "movement" INTEGER NOT NULL,
    "puckHandling" INTEGER NOT NULL,
    "consistency" INTEGER NOT NULL,
    "stamina" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GoalieAttributes_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
