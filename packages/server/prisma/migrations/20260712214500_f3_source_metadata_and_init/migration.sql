-- AlterTable
ALTER TABLE "Coach" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Coach" ADD COLUMN "sourceDataset" TEXT;
ALTER TABLE "Coach" ADD COLUMN "sourceUpdatedAt" DATETIME;

-- AlterTable
ALTER TABLE "Competition" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Competition" ADD COLUMN "sourceDataset" TEXT;
ALTER TABLE "Competition" ADD COLUMN "sourceUpdatedAt" DATETIME;

-- AlterTable
ALTER TABLE "Country" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Country" ADD COLUMN "sourceDataset" TEXT;
ALTER TABLE "Country" ADD COLUMN "sourceUpdatedAt" DATETIME;

-- AlterTable
ALTER TABLE "League" ADD COLUMN "externalId" TEXT;
ALTER TABLE "League" ADD COLUMN "sourceDataset" TEXT;
ALTER TABLE "League" ADD COLUMN "sourceUpdatedAt" DATETIME;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Player" ADD COLUMN "sourceDataset" TEXT;
ALTER TABLE "Player" ADD COLUMN "sourceUpdatedAt" DATETIME;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Team" ADD COLUMN "sourceDataset" TEXT;
ALTER TABLE "Team" ADD COLUMN "sourceUpdatedAt" DATETIME;

-- AlterTable
ALTER TABLE "WorldSeason" ADD COLUMN "sourceDataset" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppMeta" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "worldInitialized" BOOLEAN NOT NULL DEFAULT false,
    "worldDatasetId" TEXT,
    "worldInitializedAt" DATETIME,
    "worldSchemaVersion" INTEGER
);
INSERT INTO "new_AppMeta" ("createdAt", "id", "updatedAt") SELECT "createdAt", "id", "updatedAt" FROM "AppMeta";
DROP TABLE "AppMeta";
ALTER TABLE "new_AppMeta" RENAME TO "AppMeta";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Coach_sourceDataset_externalId_key" ON "Coach"("sourceDataset", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Competition_sourceDataset_externalId_key" ON "Competition"("sourceDataset", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Country_sourceDataset_externalId_key" ON "Country"("sourceDataset", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "League_sourceDataset_externalId_key" ON "League"("sourceDataset", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_sourceDataset_externalId_key" ON "Player"("sourceDataset", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_sourceDataset_externalId_key" ON "Team"("sourceDataset", "externalId");
