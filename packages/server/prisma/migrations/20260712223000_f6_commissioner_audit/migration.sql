-- CreateTable
CREATE TABLE "CommissionerAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "beforeJson" TEXT NOT NULL,
    "afterJson" TEXT NOT NULL,
    "changedFieldsJson" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "CommissionerAuditLog_entityType_entityId_createdAt_idx" ON "CommissionerAuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "CommissionerAuditLog_createdAt_idx" ON "CommissionerAuditLog"("createdAt");
