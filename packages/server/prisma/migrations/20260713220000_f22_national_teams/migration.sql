-- CreateTable
CREATE TABLE "NationalTeamProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "shortName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "defaultRosterRulesText" TEXT NOT NULL DEFAULT '{}',
    "defaultTacticsText" TEXT,
    "externalId" TEXT,
    "sourceDataset" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NationalTeamProfile_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NationalTeamProfile_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NationalTeamEdition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nationalTeamProfileId" TEXT NOT NULL,
    "competitionEditionId" TEXT NOT NULL,
    "competitionParticipantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "teamNameSnapshot" TEXT NOT NULL,
    "shortNameSnapshot" TEXT,
    "countryNameSnapshot" TEXT NOT NULL,
    "rosterRulesSnapshotText" TEXT NOT NULL DEFAULT '{}',
    "rosterRulesHash" TEXT NOT NULL DEFAULT '',
    "eligibilitySnapshotText" TEXT NOT NULL DEFAULT '{}',
    "eligibilityHash" TEXT NOT NULL DEFAULT '',
    "tacticsSnapshotText" TEXT,
    "tacticsHash" TEXT,
    "rosterHash" TEXT,
    "lineupHash" TEXT,
    "preparedAt" DATETIME,
    "confirmedAt" DATETIME,
    "lockedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NationalTeamEdition_nationalTeamProfileId_fkey" FOREIGN KEY ("nationalTeamProfileId") REFERENCES "NationalTeamProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NationalTeamEdition_competitionEditionId_fkey" FOREIGN KEY ("competitionEditionId") REFERENCES "CompetitionEdition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NationalTeamEdition_competitionParticipantId_fkey" FOREIGN KEY ("competitionParticipantId") REFERENCES "CompetitionParticipant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NationalTeamCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nationalTeamEditionId" TEXT NOT NULL,
    "sourcePlayerId" TEXT NOT NULL,
    "playerNameSnapshot" TEXT NOT NULL,
    "birthDateSnapshot" DATETIME,
    "positionSnapshot" TEXT NOT NULL,
    "clubTeamIdSnapshot" TEXT,
    "clubNameSnapshot" TEXT,
    "eligibilityStatus" TEXT NOT NULL,
    "eligibilityReasonText" TEXT NOT NULL DEFAULT '',
    "rankingScore" REAL,
    "rankingOrder" INTEGER,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inputHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NationalTeamCandidate_nationalTeamEditionId_fkey" FOREIGN KEY ("nationalTeamEditionId") REFERENCES "NationalTeamEdition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NationalTeamRosterPlayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nationalTeamEditionId" TEXT NOT NULL,
    "sourcePlayerId" TEXT NOT NULL,
    "playerNameSnapshot" TEXT NOT NULL,
    "clubTeamIdSnapshot" TEXT,
    "clubNameSnapshot" TEXT,
    "positionSnapshot" TEXT NOT NULL,
    "rosterRole" TEXT NOT NULL,
    "rosterOrder" INTEGER NOT NULL,
    "jerseyNumber" INTEGER,
    "captainRole" TEXT NOT NULL DEFAULT 'NONE',
    "selectionSource" TEXT NOT NULL DEFAULT 'MANUAL',
    "eligibilityHash" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NationalTeamRosterPlayer_nationalTeamEditionId_fkey" FOREIGN KEY ("nationalTeamEditionId") REFERENCES "NationalTeamEdition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NationalTeamStaffAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nationalTeamEditionId" TEXT NOT NULL,
    "sourceCoachId" TEXT NOT NULL,
    "coachNameSnapshot" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "assignmentOrder" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NationalTeamStaffAssignment_nationalTeamEditionId_fkey" FOREIGN KEY ("nationalTeamEditionId") REFERENCES "NationalTeamEdition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NationalTeamTactics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nationalTeamEditionId" TEXT NOT NULL,
    "tacticalStyle" TEXT NOT NULL,
    "tacticsText" TEXT NOT NULL DEFAULT '{}',
    "tacticsHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NationalTeamTactics_nationalTeamEditionId_fkey" FOREIGN KEY ("nationalTeamEditionId") REFERENCES "NationalTeamEdition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NationalTeamLineup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nationalTeamEditionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "generatedBy" TEXT NOT NULL DEFAULT 'MANUAL',
    "rosterHash" TEXT NOT NULL,
    "lineupHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NationalTeamLineup_nationalTeamEditionId_fkey" FOREIGN KEY ("nationalTeamEditionId") REFERENCES "NationalTeamEdition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NationalTeamLineupSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nationalTeamLineupId" TEXT NOT NULL,
    "unitType" TEXT NOT NULL,
    "unitNumber" INTEGER NOT NULL,
    "slotType" TEXT NOT NULL,
    "sourcePlayerId" TEXT NOT NULL,
    "playerNameSnapshot" TEXT NOT NULL,
    "positionSnapshot" TEXT NOT NULL,
    "slotOrder" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NationalTeamLineupSlot_nationalTeamLineupId_fkey" FOREIGN KEY ("nationalTeamLineupId") REFERENCES "NationalTeamLineup" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "NationalTeamProfile_teamId_key" ON "NationalTeamProfile"("teamId");

-- CreateIndex
CREATE INDEX "NationalTeamProfile_category_idx" ON "NationalTeamProfile"("category");

-- CreateIndex
CREATE INDEX "NationalTeamProfile_status_idx" ON "NationalTeamProfile"("status");

-- CreateIndex
CREATE UNIQUE INDEX "NationalTeamProfile_countryId_category_key" ON "NationalTeamProfile"("countryId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "NationalTeamProfile_sourceDataset_externalId_key" ON "NationalTeamProfile"("sourceDataset", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "NationalTeamEdition_competitionParticipantId_key" ON "NationalTeamEdition"("competitionParticipantId");

-- CreateIndex
CREATE INDEX "NationalTeamEdition_competitionEditionId_status_idx" ON "NationalTeamEdition"("competitionEditionId", "status");

-- CreateIndex
CREATE INDEX "NationalTeamEdition_status_idx" ON "NationalTeamEdition"("status");

-- CreateIndex
CREATE UNIQUE INDEX "NationalTeamEdition_nationalTeamProfileId_competitionEditionId_key" ON "NationalTeamEdition"("nationalTeamProfileId", "competitionEditionId");

-- CreateIndex
CREATE INDEX "NationalTeamCandidate_nationalTeamEditionId_eligibilityStatus_idx" ON "NationalTeamCandidate"("nationalTeamEditionId", "eligibilityStatus");

-- CreateIndex
CREATE INDEX "NationalTeamCandidate_sourcePlayerId_idx" ON "NationalTeamCandidate"("sourcePlayerId");

-- CreateIndex
CREATE INDEX "NationalTeamCandidate_rankingOrder_idx" ON "NationalTeamCandidate"("rankingOrder");

-- CreateIndex
CREATE UNIQUE INDEX "NationalTeamCandidate_nationalTeamEditionId_sourcePlayerId_key" ON "NationalTeamCandidate"("nationalTeamEditionId", "sourcePlayerId");

-- CreateIndex
CREATE INDEX "NationalTeamRosterPlayer_nationalTeamEditionId_rosterRole_idx" ON "NationalTeamRosterPlayer"("nationalTeamEditionId", "rosterRole");

-- CreateIndex
CREATE INDEX "NationalTeamRosterPlayer_sourcePlayerId_idx" ON "NationalTeamRosterPlayer"("sourcePlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "NationalTeamRosterPlayer_nationalTeamEditionId_sourcePlayerId_key" ON "NationalTeamRosterPlayer"("nationalTeamEditionId", "sourcePlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "NationalTeamRosterPlayer_nationalTeamEditionId_rosterRole_rosterOrder_key" ON "NationalTeamRosterPlayer"("nationalTeamEditionId", "rosterRole", "rosterOrder");

-- CreateIndex
CREATE INDEX "NationalTeamStaffAssignment_nationalTeamEditionId_idx" ON "NationalTeamStaffAssignment"("nationalTeamEditionId");

-- CreateIndex
CREATE INDEX "NationalTeamStaffAssignment_sourceCoachId_idx" ON "NationalTeamStaffAssignment"("sourceCoachId");

-- CreateIndex
CREATE UNIQUE INDEX "NationalTeamStaffAssignment_nationalTeamEditionId_role_assignmentOrder_key" ON "NationalTeamStaffAssignment"("nationalTeamEditionId", "role", "assignmentOrder");

-- CreateIndex
CREATE UNIQUE INDEX "NationalTeamTactics_nationalTeamEditionId_key" ON "NationalTeamTactics"("nationalTeamEditionId");

-- CreateIndex
CREATE UNIQUE INDEX "NationalTeamLineup_nationalTeamEditionId_key" ON "NationalTeamLineup"("nationalTeamEditionId");

-- CreateIndex
CREATE INDEX "NationalTeamLineupSlot_nationalTeamLineupId_slotOrder_idx" ON "NationalTeamLineupSlot"("nationalTeamLineupId", "slotOrder");

-- CreateIndex
CREATE INDEX "NationalTeamLineupSlot_sourcePlayerId_idx" ON "NationalTeamLineupSlot"("sourcePlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "NationalTeamLineupSlot_nationalTeamLineupId_unitType_unitNumber_slotType_key" ON "NationalTeamLineupSlot"("nationalTeamLineupId", "unitType", "unitNumber", "slotType");
