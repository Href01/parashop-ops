-- Shine Cosmetics BOS - Database Migrations
-- Run this against your shared Neon database

-- ============================================================================
-- EXTEND EXISTING ORDER TABLE
-- ============================================================================

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "orderNumber" VARCHAR(50) UNIQUE;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sourceChannel" VARCHAR(50);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sourceOrderId" VARCHAR(255);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sourcePayload" JSONB;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "confirmationStatus" VARCHAR(50) DEFAULT 'NEEDS_CONFIRMATION';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryStatus" VARCHAR(50) DEFAULT 'NOT_CREATED';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentMethod" VARCHAR(50);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "productsTotal" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "discountTotal" DECIMAL(10,2) DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "revenue" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryFeeCharged" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "estimatedDeliveryCost" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "actualDeliveryCost" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "codAmount" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "returnOrFailedFees" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "estimatedProfit" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "finalProfit" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "marginPercent" DECIMAL(5,2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "needsReview" BOOLEAN DEFAULT FALSE;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "senditShipmentId" VARCHAR(255);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "senditTrackingNumber" VARCHAR(255);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- Extend OrderItem
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "sku" VARCHAR(100);
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(10,2);
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "totalCost" DECIMAL(10,2);

-- Extend Product
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sku" VARCHAR(100);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "costPrice" DECIMAL(10,2);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "lowStockThreshold" INT DEFAULT 5;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "supplier" VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_product_sku" ON "Product"("sku") WHERE "sku" IS NOT NULL;

-- ============================================================================
-- NEW BOS TABLES
-- ============================================================================

-- 1. Sendit Shipments
CREATE TABLE IF NOT EXISTS "SenditShipment" (
  "id" SERIAL PRIMARY KEY,
  "orderId" INT NOT NULL REFERENCES "Order"("id") ON DELETE CASCADE,
  "senditShipmentId" VARCHAR(255),
  "trackingNumber" VARCHAR(255),
  "status" VARCHAR(50),
  "rawRequest" JSONB,
  "rawResponse" JSONB,
  "lastWebhookPayload" JSONB,
  "lastSyncedAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_sendit_order" ON "SenditShipment"("orderId");
CREATE INDEX IF NOT EXISTS "idx_sendit_shipment_id" ON "SenditShipment"("senditShipmentId");

-- 2. Order Status History
CREATE TABLE IF NOT EXISTS "OrderStatusHistory" (
  "id" SERIAL PRIMARY KEY,
  "orderId" INT NOT NULL REFERENCES "Order"("id") ON DELETE CASCADE,
  "oldStatus" VARCHAR(50),
  "newStatus" VARCHAR(50),
  "source" VARCHAR(50),
  "note" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_order_history" ON "OrderStatusHistory"("orderId", "createdAt");

-- 3. Campaigns
CREATE TABLE IF NOT EXISTS "Campaign" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(255) NOT NULL,
  "type" VARCHAR(50),
  "startDate" DATE,
  "endDate" DATE,
  "revenueTarget" DECIMAL(10,2),
  "actualRevenue" DECIMAL(10,2) DEFAULT 0,
  "status" VARCHAR(50) DEFAULT 'not_started',
  "checklist" JSONB,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "CampaignProduct" (
  "id" SERIAL PRIMARY KEY,
  "campaignId" INT REFERENCES "Campaign"("id") ON DELETE CASCADE,
  "productId" INT REFERENCES "Product"("id") ON DELETE CASCADE,
  UNIQUE("campaignId", "productId")
);

-- 4. Content Items
CREATE TABLE IF NOT EXISTS "ContentItem" (
  "id" SERIAL PRIMARY KEY,
  "title" VARCHAR(255) NOT NULL,
  "type" VARCHAR(50),
  "platform" VARCHAR(50),
  "owner" VARCHAR(100),
  "status" VARCHAR(50) DEFAULT 'idea',
  "productId" INT REFERENCES "Product"("id") ON DELETE SET NULL,
  "campaignId" INT REFERENCES "Campaign"("id") ON DELETE SET NULL,
  "hook" TEXT,
  "caption" TEXT,
  "assetLink" VARCHAR(500),
  "dueDate" DATE,
  "scheduledAt" TIMESTAMP,
  "publishedAt" TIMESTAMP,
  "reach" INT,
  "views" INT,
  "clicks" INT,
  "attributedOrders" INT,
  "salesImpact" DECIMAL(10,2),
  "notes" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_content_status" ON "ContentItem"("status");
CREATE INDEX IF NOT EXISTS "idx_content_due" ON "ContentItem"("dueDate");

-- 5. Ad Campaigns
CREATE TABLE IF NOT EXISTS "AdCampaign" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(255) NOT NULL,
  "platform" VARCHAR(50),
  "spend" DECIMAL(10,2) DEFAULT 0,
  "revenue" DECIMAL(10,2) DEFAULT 0,
  "roas" DECIMAL(10,2),
  "status" VARCHAR(50) DEFAULT 'draft',
  "campaignId" INT REFERENCES "Campaign"("id") ON DELETE SET NULL,
  "productId" INT REFERENCES "Product"("id") ON DELETE SET NULL,
  "startDate" DATE,
  "endDate" DATE,
  "notes" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- 6. Tasks
CREATE TABLE IF NOT EXISTS "Task" (
  "id" SERIAL PRIMARY KEY,
  "title" VARCHAR(255) NOT NULL,
  "owner" VARCHAR(100),
  "status" VARCHAR(50) DEFAULT 'not_started',
  "priority" VARCHAR(50) DEFAULT 'medium',
  "dueDate" DATE,
  "linkedType" VARCHAR(50),
  "linkedId" INT,
  "notes" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_task_status" ON "Task"("status");
CREATE INDEX IF NOT EXISTS "idx_task_due" ON "Task"("dueDate");

-- 7. Support Tickets
CREATE TABLE IF NOT EXISTS "SupportTicket" (
  "id" SERIAL PRIMARY KEY,
  "customerName" VARCHAR(255),
  "customerPhone" VARCHAR(50),
  "type" VARCHAR(50),
  "status" VARCHAR(50) DEFAULT 'open',
  "orderId" INT REFERENCES "Order"("id") ON DELETE SET NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_support_status" ON "SupportTicket"("status");

-- 8. Weekly Priorities
CREATE TABLE IF NOT EXISTS "WeeklyPriority" (
  "id" SERIAL PRIMARY KEY,
  "weekStartDate" DATE NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "owner" VARCHAR(100),
  "status" VARCHAR(50) DEFAULT 'planned',
  "notes" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_priority_week" ON "WeeklyPriority"("weekStartDate");

-- 9. Ideas Backlog
CREATE TABLE IF NOT EXISTS "Idea" (
  "id" SERIAL PRIMARY KEY,
  "title" VARCHAR(255) NOT NULL,
  "category" VARCHAR(50),
  "impact" VARCHAR(50),
  "effort" VARCHAR(50),
  "status" VARCHAR(50) DEFAULT 'new',
  "notes" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_idea_status" ON "Idea"("status");

-- 10. Growth Experiments
CREATE TABLE IF NOT EXISTS "GrowthExperiment" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(255) NOT NULL,
  "hypothesis" TEXT,
  "channel" VARCHAR(50),
  "productId" INT REFERENCES "Product"("id") ON DELETE SET NULL,
  "campaignId" INT REFERENCES "Campaign"("id") ON DELETE SET NULL,
  "startDate" DATE,
  "endDate" DATE,
  "budget" DECIMAL(10,2),
  "successMetric" VARCHAR(100),
  "result" TEXT,
  "status" VARCHAR(50) DEFAULT 'planned',
  "learnings" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- 11. Decision Log
CREATE TABLE IF NOT EXISTS "DecisionLog" (
  "id" SERIAL PRIMARY KEY,
  "title" VARCHAR(255) NOT NULL,
  "context" TEXT,
  "decision" TEXT NOT NULL,
  "owner" VARCHAR(100),
  "decisionDate" DATE,
  "linkedType" VARCHAR(50),
  "linkedId" INT,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- 12. Webhook Events
CREATE TABLE IF NOT EXISTS "WebhookEvent" (
  "id" SERIAL PRIMARY KEY,
  "provider" VARCHAR(50),
  "eventType" VARCHAR(100),
  "externalId" VARCHAR(255),
  "payload" JSONB,
  "processed" BOOLEAN DEFAULT FALSE,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_webhook_provider" ON "WebhookEvent"("provider", "eventType");
CREATE INDEX IF NOT EXISTS "idx_webhook_processed" ON "WebhookEvent"("processed");

-- 13. Backup Snapshots
CREATE TABLE IF NOT EXISTS "BackupSnapshot" (
  "id" SERIAL PRIMARY KEY,
  "type" VARCHAR(50),
  "payload" JSONB,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_backup_type" ON "BackupSnapshot"("type", "createdAt");

-- ============================================================================
-- AUTO-CALCULATION TRIGGERS
-- ============================================================================

-- Auto-calculate order profit when data changes
CREATE OR REPLACE FUNCTION calculate_order_profit()
RETURNS TRIGGER AS $$
BEGIN
  -- Products total (sum of order items)
  NEW."productsTotal" := (
    SELECT COALESCE(SUM("price" * "quantity"), 0)
    FROM "OrderItem"
    WHERE "orderId" = NEW.id
  );

  -- Revenue = products total - discount
  NEW."revenue" := NEW."productsTotal" - COALESCE(NEW."discountTotal", 0);

  -- Estimated profit = revenue - product cost - estimated delivery
  NEW."estimatedProfit" := NEW."revenue" - (
    SELECT COALESCE(SUM(COALESCE("unitCost", 0) * "quantity"), 0)
    FROM "OrderItem"
    WHERE "orderId" = NEW.id
  ) - COALESCE(NEW."estimatedDeliveryCost", 0);

  -- Final profit (when Sendit data available)
  IF NEW."actualDeliveryCost" IS NOT NULL THEN
    NEW."finalProfit" := COALESCE(NEW."codAmount", NEW."revenue") - (
      SELECT COALESCE(SUM(COALESCE("unitCost", 0) * "quantity"), 0)
      FROM "OrderItem"
      WHERE "orderId" = NEW.id
    ) - NEW."actualDeliveryCost" - COALESCE(NEW."returnOrFailedFees", 0);
  END IF;

  -- Margin %
  IF NEW."revenue" > 0 THEN
    NEW."marginPercent" := (COALESCE(NEW."finalProfit", NEW."estimatedProfit") / NEW."revenue") * 100;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_order_profit ON "Order";
CREATE TRIGGER trigger_calculate_order_profit
BEFORE INSERT OR UPDATE ON "Order"
FOR EACH ROW
EXECUTE FUNCTION calculate_order_profit();

-- Auto-calculate ROAS for ad campaigns
CREATE OR REPLACE FUNCTION calculate_ad_roas()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."spend" > 0 THEN
    NEW."roas" := NEW."revenue" / NEW."spend";
  ELSE
    NEW."roas" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_ad_roas ON "AdCampaign";
CREATE TRIGGER trigger_calculate_ad_roas
BEFORE INSERT OR UPDATE ON "AdCampaign"
FOR EACH ROW
EXECUTE FUNCTION calculate_ad_roas();

-- ============================================================================
-- DONE
-- ============================================================================

-- Verify tables created
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN (
    'SenditShipment',
    'OrderStatusHistory',
    'Campaign',
    'CampaignProduct',
    'ContentItem',
    'AdCampaign',
    'Task',
    'SupportTicket',
    'WeeklyPriority',
    'Idea',
    'GrowthExperiment',
    'DecisionLog',
    'WebhookEvent',
    'BackupSnapshot'
  )
ORDER BY table_name;
