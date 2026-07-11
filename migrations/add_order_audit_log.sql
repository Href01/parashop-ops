-- OrderAuditLog: Track all order deletions
CREATE TABLE "OrderAuditLog" (
  "id" SERIAL PRIMARY KEY,
  "orderId" INTEGER NOT NULL,
  "orderData" JSONB NOT NULL,
  "deletedBy" TEXT NOT NULL,
  "deletedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "reason" TEXT,
  "source" TEXT NOT NULL DEFAULT 'bos',
  "ipAddress" TEXT,
  "userAgent" TEXT
);

-- Index for fast lookups
CREATE INDEX "OrderAuditLog_orderId_idx" ON "OrderAuditLog"("orderId");
CREATE INDEX "OrderAuditLog_deletedAt_idx" ON "OrderAuditLog"("deletedAt" DESC);
CREATE INDEX "OrderAuditLog_deletedBy_idx" ON "OrderAuditLog"("deletedBy");

-- Comment
COMMENT ON TABLE "OrderAuditLog" IS 'Audit trail for deleted orders - stores full order data before deletion';
