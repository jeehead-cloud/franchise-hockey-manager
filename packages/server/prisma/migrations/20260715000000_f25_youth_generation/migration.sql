-- F25 Youth Generation: profile sets, name pools, runs, cohorts, provenance.

-- CreateTable
CREATE TABLE "YouthGenerationProfileSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "YouthGenerationProfileSetVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileSetId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "configHash" TEXT NOT NULL,
    "changeReason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBySource" TEXT,
    CONSTRAINT "YouthGenerationProfileSetVersion_profileSetId_fkey" FOREIGN KEY ("profileSetId") REFERENCES "YouthGenerationProfileSet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActiveYouthGenerationConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "activeProfileSetVersionId" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ActiveYouthGenerationConfiguration_activeProfileSetVersionId_fkey" FOREIGN KEY ("activeProfileSetVersionId") REFERENCES "YouthGenerationProfileSetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CountryNamePool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "countryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CountryNamePool_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CountryNamePoolVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "namePoolId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "maleFirstNamesText" TEXT NOT NULL,
    "lastNamesText" TEXT NOT NULL,
    "firstNameCount" INTEGER NOT NULL,
    "lastNameCount" INTEGER NOT NULL,
    "poolHash" TEXT NOT NULL,
    "changeReason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBySource" TEXT,
    CONSTRAINT "CountryNamePoolVersion_namePoolId_fkey" FOREIGN KEY ("namePoolId") REFERENCES "CountryNamePool" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CountryYouthProfileVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileSetVersionId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "profileText" TEXT NOT NULL,
    "profileHash" TEXT NOT NULL,
    "namePoolVersionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CountryYouthProfileVersion_profileSetVersionId_fkey" FOREIGN KEY ("profileSetVersionId") REFERENCES "YouthGenerationProfileSetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CountryYouthProfileVersion_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CountryYouthProfileVersion_namePoolVersionId_fkey" FOREIGN KEY ("namePoolVersionId") REFERENCES "CountryNamePoolVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "YouthGenerationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldSeasonId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "runVersion" INTEGER NOT NULL DEFAULT 1,
    "referenceDate" TEXT NOT NULL,
    "baseSeed" TEXT NOT NULL,
    "profileSetVersionId" TEXT NOT NULL,
    "profileSetHash" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "resultHash" TEXT,
    "countryCount" INTEGER NOT NULL DEFAULT 0,
    "enabledCountryCount" INTEGER NOT NULL DEFAULT 0,
    "totalPlannedPlayers" INTEGER NOT NULL DEFAULT 0,
    "totalGeneratedPlayers" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "backupPath" TEXT,
    "failureReason" TEXT,
    "plannedInputText" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "failedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "YouthGenerationRun_worldSeasonId_fkey" FOREIGN KEY ("worldSeasonId") REFERENCES "WorldSeason" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "YouthGenerationRun_profileSetVersionId_fkey" FOREIGN KEY ("profileSetVersionId") REFERENCES "YouthGenerationProfileSetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "YouthCohort" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "youthGenerationRunId" TEXT NOT NULL,
    "worldSeasonId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "countryNameSnapshot" TEXT NOT NULL,
    "referenceDate" TEXT NOT NULL,
    "cohortOrder" INTEGER NOT NULL,
    "profileHash" TEXT NOT NULL,
    "namePoolVersionId" TEXT NOT NULL,
    "namePoolHash" TEXT NOT NULL,
    "plannedSize" INTEGER NOT NULL,
    "generatedSize" INTEGER NOT NULL,
    "age15Count" INTEGER NOT NULL,
    "age16Count" INTEGER NOT NULL,
    "age17Count" INTEGER NOT NULL,
    "skaterCount" INTEGER NOT NULL,
    "goalieCount" INTEGER NOT NULL,
    "cohortHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "YouthCohort_youthGenerationRunId_fkey" FOREIGN KEY ("youthGenerationRunId") REFERENCES "YouthGenerationRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "YouthCohort_worldSeasonId_fkey" FOREIGN KEY ("worldSeasonId") REFERENCES "WorldSeason" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "YouthCohort_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "YouthCohort_namePoolVersionId_fkey" FOREIGN KEY ("namePoolVersionId") REFERENCES "CountryNamePoolVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "YouthGeneratedPlayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "youthGenerationRunId" TEXT NOT NULL,
    "youthCohortId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "generationIndex" INTEGER NOT NULL,
    "countryId" TEXT NOT NULL,
    "playerNameSnapshot" TEXT NOT NULL,
    "dateOfBirthSnapshot" TEXT NOT NULL,
    "ageOnReferenceDate" INTEGER NOT NULL,
    "positionSnapshot" TEXT NOT NULL,
    "qualityTier" TEXT NOT NULL,
    "currentAbilitySnapshot" REAL NOT NULL,
    "potentialSnapshot" INTEGER NOT NULL,
    "developmentRateSnapshot" REAL NOT NULL,
    "roleSnapshot" TEXT NOT NULL,
    "heightCmSnapshot" INTEGER,
    "weightKgSnapshot" INTEGER,
    "shootsSnapshot" TEXT,
    "generationHash" TEXT NOT NULL,
    "diagnosticsText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "YouthGeneratedPlayer_youthGenerationRunId_fkey" FOREIGN KEY ("youthGenerationRunId") REFERENCES "YouthGenerationRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "YouthGeneratedPlayer_youthCohortId_fkey" FOREIGN KEY ("youthCohortId") REFERENCES "YouthCohort" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "YouthGeneratedPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "YouthGeneratedPlayer_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "YouthGenerationProfileSet_name_key" ON "YouthGenerationProfileSet"("name");

-- CreateIndex
CREATE UNIQUE INDEX "YouthGenerationProfileSetVersion_profileSetId_versionNumber_key" ON "YouthGenerationProfileSetVersion"("profileSetId", "versionNumber");

-- CreateIndex
CREATE INDEX "YouthGenerationProfileSetVersion_configHash_idx" ON "YouthGenerationProfileSetVersion"("configHash");

-- CreateIndex
CREATE INDEX "YouthGenerationProfileSetVersion_profileSetId_createdAt_idx" ON "YouthGenerationProfileSetVersion"("profileSetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveYouthGenerationConfiguration_activeProfileSetVersionId_key" ON "ActiveYouthGenerationConfiguration"("activeProfileSetVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "CountryNamePool_countryId_name_key" ON "CountryNamePool"("countryId", "name");

-- CreateIndex
CREATE INDEX "CountryNamePool_countryId_idx" ON "CountryNamePool"("countryId");

-- CreateIndex
CREATE UNIQUE INDEX "CountryNamePoolVersion_namePoolId_versionNumber_key" ON "CountryNamePoolVersion"("namePoolId", "versionNumber");

-- CreateIndex
CREATE INDEX "CountryNamePoolVersion_poolHash_idx" ON "CountryNamePoolVersion"("poolHash");

-- CreateIndex
CREATE INDEX "CountryNamePoolVersion_namePoolId_createdAt_idx" ON "CountryNamePoolVersion"("namePoolId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CountryYouthProfileVersion_profileSetVersionId_countryId_key" ON "CountryYouthProfileVersion"("profileSetVersionId", "countryId");

-- CreateIndex
CREATE INDEX "CountryYouthProfileVersion_countryId_idx" ON "CountryYouthProfileVersion"("countryId");

-- CreateIndex
CREATE INDEX "CountryYouthProfileVersion_profileHash_idx" ON "CountryYouthProfileVersion"("profileHash");

-- CreateIndex
CREATE INDEX "CountryYouthProfileVersion_namePoolVersionId_idx" ON "CountryYouthProfileVersion"("namePoolVersionId");

-- CreateIndex
CREATE INDEX "YouthGenerationRun_worldSeasonId_status_idx" ON "YouthGenerationRun"("worldSeasonId", "status");

-- CreateIndex
CREATE INDEX "YouthGenerationRun_worldSeasonId_isCurrent_idx" ON "YouthGenerationRun"("worldSeasonId", "isCurrent");

-- CreateIndex
CREATE INDEX "YouthGenerationRun_status_idx" ON "YouthGenerationRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "YouthCohort_youthGenerationRunId_countryId_key" ON "YouthCohort"("youthGenerationRunId", "countryId");

-- CreateIndex
CREATE INDEX "YouthCohort_worldSeasonId_idx" ON "YouthCohort"("worldSeasonId");

-- CreateIndex
CREATE INDEX "YouthCohort_countryId_idx" ON "YouthCohort"("countryId");

-- CreateIndex
CREATE INDEX "YouthCohort_youthGenerationRunId_cohortOrder_idx" ON "YouthCohort"("youthGenerationRunId", "cohortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "YouthGeneratedPlayer_playerId_key" ON "YouthGeneratedPlayer"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "YouthGeneratedPlayer_youthGenerationRunId_playerId_key" ON "YouthGeneratedPlayer"("youthGenerationRunId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "YouthGeneratedPlayer_youthCohortId_generationIndex_key" ON "YouthGeneratedPlayer"("youthCohortId", "generationIndex");

-- CreateIndex
CREATE INDEX "YouthGeneratedPlayer_youthGenerationRunId_idx" ON "YouthGeneratedPlayer"("youthGenerationRunId");

-- CreateIndex
CREATE INDEX "YouthGeneratedPlayer_countryId_idx" ON "YouthGeneratedPlayer"("countryId");

-- CreateIndex
CREATE INDEX "YouthGeneratedPlayer_generationHash_idx" ON "YouthGeneratedPlayer"("generationHash");
