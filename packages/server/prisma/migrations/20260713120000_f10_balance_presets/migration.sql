-- CreateTable
CREATE TABLE "BalancePreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BalancePresetVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "presetId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "configJson" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "changeReason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBySource" TEXT,
    CONSTRAINT "BalancePresetVersion_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "BalancePreset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActiveBalanceConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "activePresetVersionId" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ActiveBalanceConfiguration_activePresetVersionId_fkey" FOREIGN KEY ("activePresetVersionId") REFERENCES "BalancePresetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BalancePreset_name_key" ON "BalancePreset"("name");

-- CreateIndex
CREATE INDEX "BalancePresetVersion_configHash_idx" ON "BalancePresetVersion"("configHash");

-- CreateIndex
CREATE INDEX "BalancePresetVersion_presetId_createdAt_idx" ON "BalancePresetVersion"("presetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BalancePresetVersion_presetId_versionNumber_key" ON "BalancePresetVersion"("presetId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveBalanceConfiguration_activePresetVersionId_key" ON "ActiveBalanceConfiguration"("activePresetVersionId");
