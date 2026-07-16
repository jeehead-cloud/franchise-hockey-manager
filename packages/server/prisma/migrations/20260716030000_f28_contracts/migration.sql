ALTER TABLE "AppMeta" ADD COLUMN "contractsInitializedAt" DATETIME;

CREATE TABLE "ContractPreset" (
  "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "description" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "ContractPreset_name_key" ON "ContractPreset"("name");

CREATE TABLE "ContractPresetVersion" (
  "id" TEXT NOT NULL PRIMARY KEY, "presetId" TEXT NOT NULL, "versionNumber" INTEGER NOT NULL,
  "schemaVersion" INTEGER NOT NULL, "configJson" TEXT NOT NULL, "configHash" TEXT NOT NULL,
  "changeReason" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdBySource" TEXT,
  CONSTRAINT "ContractPresetVersion_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "ContractPreset"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ContractPresetVersion_configHash_idx" ON "ContractPresetVersion"("configHash");
CREATE UNIQUE INDEX "ContractPresetVersion_presetId_versionNumber_key" ON "ContractPresetVersion"("presetId", "versionNumber");

CREATE TABLE "ActiveContractConfiguration" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default', "activePresetVersionId" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ActiveContractConfiguration_activePresetVersionId_fkey" FOREIGN KEY ("activePresetVersionId") REFERENCES "ContractPresetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ActiveContractConfiguration_activePresetVersionId_key" ON "ActiveContractConfiguration"("activePresetVersionId");

CREATE TABLE "PlayerContract" (
  "id" TEXT NOT NULL PRIMARY KEY, "playerId" TEXT NOT NULL, "teamId" TEXT NOT NULL,
  "startWorldSeasonId" TEXT NOT NULL, "endWorldSeasonId" TEXT NOT NULL,
  "startSeasonOrderSnapshot" INTEGER NOT NULL, "endSeasonOrderSnapshot" INTEGER NOT NULL,
  "annualSalary" INTEGER NOT NULL, "status" TEXT NOT NULL, "contractType" TEXT NOT NULL, "source" TEXT NOT NULL,
  "signedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "activatedAt" DATETIME, "expiredAt" DATETIME, "terminatedAt" DATETIME,
  "supersedesContractId" TEXT, "originatingOfferId" TEXT, "originatingDraftRightId" TEXT,
  "configVersionId" TEXT NOT NULL, "configHash" TEXT NOT NULL, "playerNameSnapshot" TEXT NOT NULL,
  "teamNameSnapshot" TEXT NOT NULL, "termsHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PlayerContract_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PlayerContract_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PlayerContract_startWorldSeasonId_fkey" FOREIGN KEY ("startWorldSeasonId") REFERENCES "WorldSeason"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PlayerContract_endWorldSeasonId_fkey" FOREIGN KEY ("endWorldSeasonId") REFERENCES "WorldSeason"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PlayerContract_configVersionId_fkey" FOREIGN KEY ("configVersionId") REFERENCES "ContractPresetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PlayerContract_supersedesContractId_fkey" FOREIGN KEY ("supersedesContractId") REFERENCES "PlayerContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PlayerContract_originatingOfferId_fkey" FOREIGN KEY ("originatingOfferId") REFERENCES "ContractOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PlayerContract_originatingDraftRightId_fkey" FOREIGN KEY ("originatingDraftRightId") REFERENCES "PlayerDraftRight"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK ("startSeasonOrderSnapshot" <= "endSeasonOrderSnapshot"), CHECK ("annualSalary" > 0)
);
CREATE UNIQUE INDEX "PlayerContract_originatingOfferId_key" ON "PlayerContract"("originatingOfferId");
CREATE UNIQUE INDEX "PlayerContract_originatingDraftRightId_key" ON "PlayerContract"("originatingDraftRightId");
CREATE INDEX "PlayerContract_playerId_status_idx" ON "PlayerContract"("playerId", "status");
CREATE INDEX "PlayerContract_teamId_status_endSeasonOrderSnapshot_idx" ON "PlayerContract"("teamId", "status", "endSeasonOrderSnapshot");
CREATE INDEX "PlayerContract_startWorldSeasonId_idx" ON "PlayerContract"("startWorldSeasonId");
CREATE INDEX "PlayerContract_endWorldSeasonId_idx" ON "PlayerContract"("endWorldSeasonId");
CREATE UNIQUE INDEX "PlayerContract_one_active_per_player" ON "PlayerContract"("playerId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "PlayerContract_one_future_per_player" ON "PlayerContract"("playerId") WHERE "status" = 'FUTURE';

CREATE TABLE "ContractRecommendation" (
  "id" TEXT NOT NULL PRIMARY KEY, "playerId" TEXT NOT NULL, "teamId" TEXT NOT NULL, "currentContractId" TEXT,
  "recommendationType" TEXT NOT NULL, "recommendedSalary" INTEGER NOT NULL, "recommendedTermYears" INTEGER NOT NULL,
  "factorsText" TEXT NOT NULL, "configVersionId" TEXT NOT NULL, "configHash" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL, "recommendationHash" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractRecommendation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractRecommendation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractRecommendation_currentContractId_fkey" FOREIGN KEY ("currentContractId") REFERENCES "PlayerContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractRecommendation_configVersionId_fkey" FOREIGN KEY ("configVersionId") REFERENCES "ContractPresetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ContractRecommendation_playerId_teamId_createdAt_idx" ON "ContractRecommendation"("playerId", "teamId", "createdAt");

CREATE TABLE "ContractOffer" (
  "id" TEXT NOT NULL PRIMARY KEY, "playerId" TEXT NOT NULL, "offeringTeamId" TEXT NOT NULL,
  "offerType" TEXT NOT NULL, "targetContractType" TEXT NOT NULL, "startWorldSeasonId" TEXT NOT NULL, "endWorldSeasonId" TEXT NOT NULL,
  "annualSalary" INTEGER NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "currentContractId" TEXT, "draftRightId" TEXT,
  "configVersionId" TEXT NOT NULL, "configHash" TEXT NOT NULL, "playerStateHash" TEXT NOT NULL, "termsHash" TEXT NOT NULL,
  "submittedAt" DATETIME, "acceptedAt" DATETIME, "rejectedAt" DATETIME, "withdrawnAt" DATETIME,
  "expiresAtSeasonOrder" INTEGER, "reason" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ContractOffer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractOffer_offeringTeamId_fkey" FOREIGN KEY ("offeringTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractOffer_startWorldSeasonId_fkey" FOREIGN KEY ("startWorldSeasonId") REFERENCES "WorldSeason"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractOffer_endWorldSeasonId_fkey" FOREIGN KEY ("endWorldSeasonId") REFERENCES "WorldSeason"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractOffer_currentContractId_fkey" FOREIGN KEY ("currentContractId") REFERENCES "PlayerContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractOffer_draftRightId_fkey" FOREIGN KEY ("draftRightId") REFERENCES "PlayerDraftRight"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractOffer_configVersionId_fkey" FOREIGN KEY ("configVersionId") REFERENCES "ContractPresetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ContractOffer_playerId_status_offerType_idx" ON "ContractOffer"("playerId", "status", "offerType");
CREATE INDEX "ContractOffer_offeringTeamId_status_idx" ON "ContractOffer"("offeringTeamId", "status");

CREATE TABLE "ContractInitializationRun" (
  "id" TEXT NOT NULL PRIMARY KEY, "worldSeasonId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PREPARED',
  "inputHash" TEXT NOT NULL, "resultHash" TEXT, "totalContracts" INTEGER NOT NULL, "annualSalaryTotal" INTEGER NOT NULL,
  "configVersionId" TEXT NOT NULL, "reason" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" DATETIME,
  CONSTRAINT "ContractInitializationRun_worldSeasonId_fkey" FOREIGN KEY ("worldSeasonId") REFERENCES "WorldSeason"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractInitializationRun_configVersionId_fkey" FOREIGN KEY ("configVersionId") REFERENCES "ContractPresetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ContractInitializationRun_worldSeasonId_status_idx" ON "ContractInitializationRun"("worldSeasonId", "status");

CREATE TABLE "ContractExpirationRun" (
  "id" TEXT NOT NULL PRIMARY KEY, "worldSeasonId" TEXT NOT NULL, "effectiveSeasonOrder" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PREPARED', "inputHash" TEXT NOT NULL, "resultHash" TEXT,
  "totalContracts" INTEGER NOT NULL, "expiredCount" INTEGER NOT NULL DEFAULT 0, "activatedFutureCount" INTEGER NOT NULL DEFAULT 0,
  "freeAgentCount" INTEGER NOT NULL DEFAULT 0, "configVersionId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" DATETIME, "reason" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
  CONSTRAINT "ContractExpirationRun_worldSeasonId_fkey" FOREIGN KEY ("worldSeasonId") REFERENCES "WorldSeason"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractExpirationRun_configVersionId_fkey" FOREIGN KEY ("configVersionId") REFERENCES "ContractPresetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ContractExpirationRun_worldSeasonId_status_idx" ON "ContractExpirationRun"("worldSeasonId", "status");
CREATE UNIQUE INDEX "ContractExpirationRun_worldSeasonId_status_key" ON "ContractExpirationRun"("worldSeasonId", "status");

CREATE TABLE "ContractTransaction" (
  "id" TEXT NOT NULL PRIMARY KEY, "transactionType" TEXT NOT NULL, "playerId" TEXT NOT NULL, "teamId" TEXT, "otherTeamId" TEXT,
  "contractId" TEXT, "offerId" TEXT, "draftRightId" TEXT, "expirationRunId" TEXT, "effectiveWorldSeasonId" TEXT,
  "playerNameSnapshot" TEXT NOT NULL, "teamNameSnapshot" TEXT, "termsSnapshotText" TEXT, "reason" TEXT NOT NULL,
  "source" TEXT NOT NULL, "transactionHash" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractTransaction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractTransaction_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractTransaction_otherTeamId_fkey" FOREIGN KEY ("otherTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractTransaction_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "PlayerContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractTransaction_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ContractOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractTransaction_draftRightId_fkey" FOREIGN KEY ("draftRightId") REFERENCES "PlayerDraftRight"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractTransaction_expirationRunId_fkey" FOREIGN KEY ("expirationRunId") REFERENCES "ContractExpirationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractTransaction_effectiveWorldSeasonId_fkey" FOREIGN KEY ("effectiveWorldSeasonId") REFERENCES "WorldSeason"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ContractTransaction_transactionHash_key" ON "ContractTransaction"("transactionHash");
CREATE INDEX "ContractTransaction_playerId_transactionType_createdAt_idx" ON "ContractTransaction"("playerId", "transactionType", "createdAt");
CREATE INDEX "ContractTransaction_teamId_transactionType_createdAt_idx" ON "ContractTransaction"("teamId", "transactionType", "createdAt");
