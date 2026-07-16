-- F29 — Trades and Rights Transfers.
-- Adds versioned trade configuration, two-club trade proposals, immutable asset
-- snapshots, atomic completed-trade history, and append-only transfer transactions.
-- Performs no trades, no ownership changes, and no Player/contract/pick/right mutations.

-- PlayerContract gains an optional F29 transfer-reference column.
ALTER TABLE "PlayerContract" ADD COLUMN "transferredByTradeId" TEXT;

-- CreateTable
CREATE TABLE "TradePreset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "TradePreset_name_key" ON "TradePreset"("name");

-- CreateTable
CREATE TABLE "TradePresetVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "presetId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "schemaVersion" INTEGER NOT NULL,
  "configJson" TEXT NOT NULL,
  "configHash" TEXT NOT NULL,
  "changeReason" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBySource" TEXT,
  CONSTRAINT "TradePresetVersion_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "TradePreset"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TradePresetVersion_presetId_versionNumber_key" ON "TradePresetVersion"("presetId", "versionNumber");
CREATE INDEX "TradePresetVersion_configHash_idx" ON "TradePresetVersion"("configHash");

-- CreateTable
CREATE TABLE "ActiveTradeConfiguration" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
  "activePresetVersionId" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ActiveTradeConfiguration_activePresetVersionId_fkey" FOREIGN KEY ("activePresetVersionId") REFERENCES "TradePresetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ActiveTradeConfiguration_activePresetVersionId_key" ON "ActiveTradeConfiguration"("activePresetVersionId");

-- CreateTable
CREATE TABLE "TradeProposal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "proposingTeamId" TEXT NOT NULL,
  "receivingTeamId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "configVersionId" TEXT NOT NULL,
  "configHash" TEXT NOT NULL,
  "proposedBy" TEXT NOT NULL,
  "reason" TEXT,
  "proposingTeamUpdatedAtSnapshot" DATETIME NOT NULL,
  "receivingTeamUpdatedAtSnapshot" DATETIME NOT NULL,
  "proposalHash" TEXT NOT NULL,
  "submittedAt" DATETIME,
  "acceptedAt" DATETIME,
  "rejectedAt" DATETIME,
  "withdrawnAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "TradeProposal_proposingTeamId_fkey" FOREIGN KEY ("proposingTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TradeProposal_receivingTeamId_fkey" FOREIGN KEY ("receivingTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TradeProposal_configVersionId_fkey" FOREIGN KEY ("configVersionId") REFERENCES "TradePresetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "TradeProposal_proposingTeamId_status_createdAt_idx" ON "TradeProposal"("proposingTeamId", "status", "createdAt");
CREATE INDEX "TradeProposal_receivingTeamId_status_createdAt_idx" ON "TradeProposal"("receivingTeamId", "status", "createdAt");
CREATE INDEX "TradeProposal_status_createdAt_idx" ON "TradeProposal"("status", "createdAt");

-- CreateTable
CREATE TABLE "TradeProposalAsset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tradeProposalId" TEXT NOT NULL,
  "side" TEXT NOT NULL,
  "assetType" TEXT NOT NULL,
  "playerContractId" TEXT,
  "draftPickId" TEXT,
  "playerDraftRightId" TEXT,
  "sourceTeamId" TEXT NOT NULL,
  "targetTeamId" TEXT NOT NULL,
  "assetSnapshotText" TEXT NOT NULL,
  "valuationSnapshotText" TEXT NOT NULL,
  "valuationHash" TEXT NOT NULL,
  "assetHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TradeProposalAsset_tradeProposalId_fkey" FOREIGN KEY ("tradeProposalId") REFERENCES "TradeProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TradeProposalAsset_sourceTeamId_fkey" FOREIGN KEY ("sourceTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TradeProposalAsset_playerContractId_fkey" FOREIGN KEY ("playerContractId") REFERENCES "PlayerContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TradeProposalAsset_draftPickId_fkey" FOREIGN KEY ("draftPickId") REFERENCES "DraftPick"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TradeProposalAsset_playerDraftRightId_fkey" FOREIGN KEY ("playerDraftRightId") REFERENCES "PlayerDraftRight"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "TradeProposalAsset_tradeProposalId_side_idx" ON "TradeProposalAsset"("tradeProposalId", "side");
CREATE INDEX "TradeProposalAsset_tradeProposalId_assetType_idx" ON "TradeProposalAsset"("tradeProposalId", "assetType");
CREATE INDEX "TradeProposalAsset_sourceTeamId_idx" ON "TradeProposalAsset"("sourceTeamId");
CREATE INDEX "TradeProposalAsset_playerContractId_idx" ON "TradeProposalAsset"("playerContractId");
CREATE INDEX "TradeProposalAsset_draftPickId_idx" ON "TradeProposalAsset"("draftPickId");
CREATE INDEX "TradeProposalAsset_playerDraftRightId_idx" ON "TradeProposalAsset"("playerDraftRightId");

-- CreateTable
CREATE TABLE "CompletedTrade" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tradeProposalId" TEXT NOT NULL,
  "proposingTeamId" TEXT NOT NULL,
  "receivingTeamId" TEXT NOT NULL,
  "proposingTeamNameSnapshot" TEXT NOT NULL,
  "receivingTeamNameSnapshot" TEXT NOT NULL,
  "effectiveWorldSeasonId" TEXT,
  "configVersionId" TEXT NOT NULL,
  "configHash" TEXT NOT NULL,
  "tradeHash" TEXT NOT NULL,
  "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompletedTrade_tradeProposalId_fkey" FOREIGN KEY ("tradeProposalId") REFERENCES "TradeProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CompletedTrade_proposingTeamId_fkey" FOREIGN KEY ("proposingTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CompletedTrade_receivingTeamId_fkey" FOREIGN KEY ("receivingTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CompletedTrade_effectiveWorldSeasonId_fkey" FOREIGN KEY ("effectiveWorldSeasonId") REFERENCES "WorldSeason"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CompletedTrade_configVersionId_fkey" FOREIGN KEY ("configVersionId") REFERENCES "TradePresetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CompletedTrade_tradeProposalId_key" ON "CompletedTrade"("tradeProposalId");
CREATE INDEX "CompletedTrade_proposingTeamId_completedAt_idx" ON "CompletedTrade"("proposingTeamId", "completedAt");
CREATE INDEX "CompletedTrade_receivingTeamId_completedAt_idx" ON "CompletedTrade"("receivingTeamId", "completedAt");
CREATE INDEX "CompletedTrade_completedAt_idx" ON "CompletedTrade"("completedAt");
CREATE INDEX "PlayerContract_transferredByTradeId_idx" ON "PlayerContract"("transferredByTradeId");

-- CreateTable
CREATE TABLE "CompletedTradeAsset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "completedTradeId" TEXT NOT NULL,
  "side" TEXT NOT NULL,
  "assetType" TEXT NOT NULL,
  "sourceTeamId" TEXT NOT NULL,
  "targetTeamId" TEXT NOT NULL,
  "playerId" TEXT,
  "playerContractId" TEXT,
  "draftPickId" TEXT,
  "playerDraftRightId" TEXT,
  "assetSnapshotText" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompletedTradeAsset_completedTradeId_fkey" FOREIGN KEY ("completedTradeId") REFERENCES "CompletedTrade"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompletedTradeAsset_sourceTeamId_fkey" FOREIGN KEY ("sourceTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CompletedTradeAsset_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CompletedTradeAsset_playerContractId_fkey" FOREIGN KEY ("playerContractId") REFERENCES "PlayerContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CompletedTradeAsset_draftPickId_fkey" FOREIGN KEY ("draftPickId") REFERENCES "DraftPick"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CompletedTradeAsset_playerDraftRightId_fkey" FOREIGN KEY ("playerDraftRightId") REFERENCES "PlayerDraftRight"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "CompletedTradeAsset_completedTradeId_side_idx" ON "CompletedTradeAsset"("completedTradeId", "side");
CREATE INDEX "CompletedTradeAsset_sourceTeamId_idx" ON "CompletedTradeAsset"("sourceTeamId");
CREATE INDEX "CompletedTradeAsset_playerId_idx" ON "CompletedTradeAsset"("playerId");
CREATE INDEX "CompletedTradeAsset_draftPickId_idx" ON "CompletedTradeAsset"("draftPickId");
CREATE INDEX "CompletedTradeAsset_playerDraftRightId_idx" ON "CompletedTradeAsset"("playerDraftRightId");

-- CreateTable
CREATE TABLE "TradeTransaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "completedTradeId" TEXT NOT NULL,
  "transactionType" TEXT NOT NULL,
  "playerId" TEXT,
  "contractId" TEXT,
  "draftPickId" TEXT,
  "draftRightId" TEXT,
  "fromTeamId" TEXT NOT NULL,
  "toTeamId" TEXT NOT NULL,
  "assetNameSnapshot" TEXT NOT NULL,
  "transactionHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TradeTransaction_completedTradeId_fkey" FOREIGN KEY ("completedTradeId") REFERENCES "CompletedTrade"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TradeTransaction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TradeTransaction_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "PlayerContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TradeTransaction_draftPickId_fkey" FOREIGN KEY ("draftPickId") REFERENCES "DraftPick"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TradeTransaction_draftRightId_fkey" FOREIGN KEY ("draftRightId") REFERENCES "PlayerDraftRight"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TradeTransaction_fromTeamId_fkey" FOREIGN KEY ("fromTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TradeTransaction_toTeamId_fkey" FOREIGN KEY ("toTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TradeTransaction_transactionHash_key" ON "TradeTransaction"("transactionHash");
CREATE INDEX "TradeTransaction_completedTradeId_transactionType_idx" ON "TradeTransaction"("completedTradeId", "transactionType");
CREATE INDEX "TradeTransaction_playerId_transactionType_createdAt_idx" ON "TradeTransaction"("playerId", "transactionType", "createdAt");
CREATE INDEX "TradeTransaction_fromTeamId_transactionType_createdAt_idx" ON "TradeTransaction"("fromTeamId", "transactionType", "createdAt");
CREATE INDEX "TradeTransaction_toTeamId_transactionType_createdAt_idx" ON "TradeTransaction"("toTeamId", "transactionType", "createdAt");
CREATE INDEX "TradeTransaction_draftPickId_idx" ON "TradeTransaction"("draftPickId");
CREATE INDEX "TradeTransaction_draftRightId_idx" ON "TradeTransaction"("draftRightId");
