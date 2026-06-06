-- Migration: Add Customers CRM & Inventory Management
-- Date: 2026-06-06
-- Purpose: Complete BOS suite with customer segmentation and inventory tracking

-- ================================================================
-- PART 1: CUSTOMERS CRM
-- ================================================================

-- Add customer-specific fields to User table
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "segment" TEXT DEFAULT 'New',
ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "ordersCount" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "lifetimeValue" DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS "averageOrderValue" DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS "lastOrderDate" TIMESTAMP,
ADD COLUMN IF NOT EXISTS "daysSinceLastOrder" INTEGER,
ADD COLUMN IF NOT EXISTS "favoriteCategories" TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "preferredPayment" TEXT,
ADD COLUMN IF NOT EXISTS "preferredCity" TEXT,
ADD COLUMN IF NOT EXISTS "emailOptIn" BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS "smsOptIn" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "whatsappOptIn" BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS "lastContactDate" TIMESTAMP,
ADD COLUMN IF NOT EXISTS "recencyScore" INTEGER CHECK ("recencyScore" BETWEEN 1 AND 5),
ADD COLUMN IF NOT EXISTS "frequencyScore" INTEGER CHECK ("frequencyScore" BETWEEN 1 AND 5),
ADD COLUMN IF NOT EXISTS "monetaryScore" INTEGER CHECK ("monetaryScore" BETWEEN 1 AND 5),
ADD COLUMN IF NOT EXISTS "rfmScore" TEXT,
ADD COLUMN IF NOT EXISTS "churnRisk" INTEGER DEFAULT 0 CHECK ("churnRisk" BETWEEN 0 AND 100),
ADD COLUMN IF NOT EXISTS "churnPrediction" DATE,
ADD COLUMN IF NOT EXISTS "tier" TEXT DEFAULT 'Bronze' CHECK ("tier" IN ('Bronze', 'Silver', 'Gold', 'Platinum')),
ADD COLUMN IF NOT EXISTS "notes" TEXT,
ADD COLUMN IF NOT EXISTS "lastRfmUpdate" TIMESTAMP;

-- Create index for common customer queries
CREATE INDEX IF NOT EXISTS "idx_user_segment" ON "User"("segment");
CREATE INDEX IF NOT EXISTS "idx_user_rfm" ON "User"("rfmScore");
CREATE INDEX IF NOT EXISTS "idx_user_tier" ON "User"("tier");
CREATE INDEX IF NOT EXISTS "idx_user_last_order" ON "User"("lastOrderDate");
CREATE INDEX IF NOT EXISTS "idx_user_churn_risk" ON "User"("churnRisk");

-- Customer Activity Log
CREATE TABLE IF NOT EXISTS "CustomerActivity" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "type" TEXT NOT NULL, -- Order, Review, Support, Email, SMS, etc.
  "action" TEXT NOT NULL, -- Created, Updated, Clicked, Replied, etc.
  "description" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_customer_activity_user" ON "CustomerActivity"("userId");
CREATE INDEX IF NOT EXISTS "idx_customer_activity_type" ON "CustomerActivity"("type");
CREATE INDEX IF NOT EXISTS "idx_customer_activity_date" ON "CustomerActivity"("createdAt");

-- Customer Segments (predefined + custom)
CREATE TABLE IF NOT EXISTS "CustomerSegment" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "color" TEXT,
  "criteria" JSONB, -- Filters like {lifetimeValue: {$gt: 1000}}
  "userCount" INTEGER DEFAULT 0,
  "automated" BOOLEAN DEFAULT false, -- Auto-update membership
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Customer Segment Membership (for custom segments)
CREATE TABLE IF NOT EXISTS "CustomerSegmentMember" (
  "id" SERIAL PRIMARY KEY,
  "segmentId" INTEGER NOT NULL REFERENCES "CustomerSegment"(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "addedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE("segmentId", "userId")
);

CREATE INDEX IF NOT EXISTS "idx_segment_member_segment" ON "CustomerSegmentMember"("segmentId");
CREATE INDEX IF NOT EXISTS "idx_segment_member_user" ON "CustomerSegmentMember"("userId");

-- ================================================================
-- PART 2: INVENTORY MANAGEMENT
-- ================================================================

-- Add inventory fields to Product table
ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "stock" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "reorderPoint" INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS "reorderQuantity" INTEGER DEFAULT 20,
ADD COLUMN IF NOT EXISTS "supplier" TEXT,
ADD COLUMN IF NOT EXISTS "supplierSKU" TEXT,
ADD COLUMN IF NOT EXISTS "lastRestockDate" TIMESTAMP,
ADD COLUMN IF NOT EXISTS "costPrice" DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS "weeklySales" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "monthlyRevenue" DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS "profitMargin" DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS "daysOfStockLeft" INTEGER,
ADD COLUMN IF NOT EXISTS "stockStatus" TEXT DEFAULT 'In stock' CHECK ("stockStatus" IN ('In stock', 'Low stock', 'Out of stock', 'Discontinued')),
ADD COLUMN IF NOT EXISTS "trackInventory" BOOLEAN DEFAULT true;

-- Create index for inventory queries
CREATE INDEX IF NOT EXISTS "idx_product_stock" ON "Product"("stock");
CREATE INDEX IF NOT EXISTS "idx_product_stock_status" ON "Product"("stockStatus");
CREATE INDEX IF NOT EXISTS "idx_product_supplier" ON "Product"("supplier");

-- Inventory Movements (track all stock changes)
CREATE TABLE IF NOT EXISTS "InventoryMovement" (
  "id" SERIAL PRIMARY KEY,
  "productId" INTEGER NOT NULL REFERENCES "Product"(id) ON DELETE CASCADE,
  "type" TEXT NOT NULL CHECK ("type" IN ('Purchase', 'Sale', 'Adjustment', 'Return', 'Damage', 'Transfer')),
  "quantity" INTEGER NOT NULL, -- Positive for additions, negative for reductions
  "stockBefore" INTEGER NOT NULL,
  "stockAfter" INTEGER NOT NULL,
  "reason" TEXT,
  "orderId" INTEGER REFERENCES "Order"(id),
  "supplierId" INTEGER,
  "costPerUnit" DECIMAL(10,2),
  "totalCost" DECIMAL(10,2),
  "performedBy" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_inventory_movement_product" ON "InventoryMovement"("productId");
CREATE INDEX IF NOT EXISTS "idx_inventory_movement_type" ON "InventoryMovement"("type");
CREATE INDEX IF NOT EXISTS "idx_inventory_movement_date" ON "InventoryMovement"("createdAt");
CREATE INDEX IF NOT EXISTS "idx_inventory_movement_order" ON "InventoryMovement"("orderId");

-- Stock Alerts
CREATE TABLE IF NOT EXISTS "StockAlert" (
  "id" SERIAL PRIMARY KEY,
  "productId" INTEGER NOT NULL REFERENCES "Product"(id) ON DELETE CASCADE,
  "type" TEXT NOT NULL CHECK ("type" IN ('Low stock', 'Out of stock', 'Overstock', 'Expiring soon')),
  "threshold" INTEGER,
  "currentStock" INTEGER,
  "message" TEXT,
  "severity" TEXT DEFAULT 'warning' CHECK ("severity" IN ('info', 'warning', 'critical')),
  "acknowledged" BOOLEAN DEFAULT false,
  "acknowledgedBy" TEXT,
  "acknowledgedAt" TIMESTAMP,
  "resolvedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_stock_alert_product" ON "StockAlert"("productId");
CREATE INDEX IF NOT EXISTS "idx_stock_alert_type" ON "StockAlert"("type");
CREATE INDEX IF NOT EXISTS "idx_stock_alert_acknowledged" ON "StockAlert"("acknowledged");
CREATE INDEX IF NOT EXISTS "idx_stock_alert_severity" ON "StockAlert"("severity");

-- Suppliers
CREATE TABLE IF NOT EXISTS "Supplier" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "contact" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "city" TEXT,
  "country" TEXT DEFAULT 'Morocco',
  "website" TEXT,
  "leadTimeDays" INTEGER DEFAULT 7,
  "reliabilityScore" INTEGER DEFAULT 100 CHECK ("reliabilityScore" BETWEEN 0 AND 100),
  "notes" TEXT,
  "active" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Supplier Products (product catalog per supplier with pricing)
CREATE TABLE IF NOT EXISTS "SupplierProduct" (
  "id" SERIAL PRIMARY KEY,
  "supplierId" INTEGER NOT NULL REFERENCES "Supplier"(id) ON DELETE CASCADE,
  "productId" INTEGER NOT NULL REFERENCES "Product"(id) ON DELETE CASCADE,
  "supplierSKU" TEXT,
  "costPrice" DECIMAL(10,2) NOT NULL,
  "currency" TEXT DEFAULT 'MAD',
  "moq" INTEGER DEFAULT 1, -- Minimum order quantity
  "leadTimeDays" INTEGER,
  "lastOrderDate" TIMESTAMP,
  "notes" TEXT,
  "active" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE("supplierId", "productId")
);

CREATE INDEX IF NOT EXISTS "idx_supplier_product_supplier" ON "SupplierProduct"("supplierId");
CREATE INDEX IF NOT EXISTS "idx_supplier_product_product" ON "SupplierProduct"("productId");

-- Purchase Orders
CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
  "id" SERIAL PRIMARY KEY,
  "orderNumber" TEXT UNIQUE,
  "supplierId" INTEGER NOT NULL REFERENCES "Supplier"(id),
  "status" TEXT DEFAULT 'Draft' CHECK ("status" IN ('Draft', 'Sent', 'Confirmed', 'Received', 'Cancelled')),
  "totalCost" DECIMAL(10,2) DEFAULT 0.00,
  "currency" TEXT DEFAULT 'MAD',
  "expectedDelivery" DATE,
  "actualDelivery" DATE,
  "notes" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_purchase_order_supplier" ON "PurchaseOrder"("supplierId");
CREATE INDEX IF NOT EXISTS "idx_purchase_order_status" ON "PurchaseOrder"("status");

-- Purchase Order Items
CREATE TABLE IF NOT EXISTS "PurchaseOrderItem" (
  "id" SERIAL PRIMARY KEY,
  "purchaseOrderId" INTEGER NOT NULL REFERENCES "PurchaseOrder"(id) ON DELETE CASCADE,
  "productId" INTEGER NOT NULL REFERENCES "Product"(id),
  "quantity" INTEGER NOT NULL,
  "costPerUnit" DECIMAL(10,2) NOT NULL,
  "totalCost" DECIMAL(10,2) NOT NULL,
  "receivedQuantity" INTEGER DEFAULT 0,
  "notes" TEXT
);

CREATE INDEX IF NOT EXISTS "idx_po_item_po" ON "PurchaseOrderItem"("purchaseOrderId");
CREATE INDEX IF NOT EXISTS "idx_po_item_product" ON "PurchaseOrderItem"("productId");

-- ================================================================
-- PART 3: HELPER FUNCTIONS
-- ================================================================

-- Function to auto-generate purchase order numbers
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  po_number TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING("orderNumber" FROM 8) AS INTEGER)), 0) + 1
  INTO next_num
  FROM "PurchaseOrder"
  WHERE "orderNumber" LIKE 'PO-2026-%';

  po_number := 'PO-2026-' || LPAD(next_num::TEXT, 4, '0');
  RETURN po_number;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-set PO number on insert
CREATE OR REPLACE FUNCTION set_po_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."orderNumber" IS NULL THEN
    NEW."orderNumber" := generate_po_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_po_number
BEFORE INSERT ON "PurchaseOrder"
FOR EACH ROW
EXECUTE FUNCTION set_po_number();

-- ================================================================
-- PART 4: SEED DATA
-- ================================================================

-- Insert default customer segments
INSERT INTO "CustomerSegment" ("name", "description", "color", "automated") VALUES
  ('VIP', 'High-value customers (LTV > 2000 MAD or 10+ orders)', '#10B981', true),
  ('Regular', 'Active customers with 2-9 orders', '#3B82F6', true),
  ('At Risk', 'Haven''t ordered in 90+ days', '#F59E0B', true),
  ('New', 'First-time customers (1 order only)', '#8B5CF6', true),
  ('Churned', 'No orders in 180+ days', '#EF4444', true)
ON CONFLICT ("name") DO NOTHING;

-- ================================================================
-- PART 5: VIEWS FOR QUICK QUERIES
-- ================================================================

-- View: Low stock products (need reordering)
CREATE OR REPLACE VIEW "LowStockProducts" AS
SELECT
  p.id,
  p.name,
  p.brand,
  p.stock,
  p."reorderPoint",
  p."reorderQuantity",
  p.supplier,
  p."daysOfStockLeft",
  p."weeklySales"
FROM "Product" p
WHERE p."trackInventory" = true
  AND p.stock <= p."reorderPoint"
  AND p."stockStatus" != 'Discontinued'
ORDER BY p.stock ASC, p."weeklySales" DESC;

-- View: VIP Customers
CREATE OR REPLACE VIEW "VIPCustomers" AS
SELECT
  u.id,
  u.name,
  u.email,
  u.phone,
  u."lifetimeValue",
  u."ordersCount",
  u."averageOrderValue",
  u."lastOrderDate",
  u."rfmScore",
  u.tier
FROM "User" u
WHERE u."lifetimeValue" >= 2000 OR u."ordersCount" >= 10
ORDER BY u."lifetimeValue" DESC;

-- View: At-Risk Customers
CREATE OR REPLACE VIEW "AtRiskCustomers" AS
SELECT
  u.id,
  u.name,
  u.email,
  u.phone,
  u."lifetimeValue",
  u."ordersCount",
  u."lastOrderDate",
  u."daysSinceLastOrder",
  u."churnRisk"
FROM "User" u
WHERE u."daysSinceLastOrder" >= 90
  AND u."ordersCount" >= 2
ORDER BY u."churnRisk" DESC, u."lifetimeValue" DESC;

-- ================================================================
-- SUCCESS MESSAGE
-- ================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 002 completed successfully!';
  RAISE NOTICE '📊 Customers CRM: Added 23 fields + 3 tables + 3 views';
  RAISE NOTICE '📦 Inventory: Added 14 fields + 7 tables + helper functions';
  RAISE NOTICE '🎯 Run: SELECT * FROM "LowStockProducts" LIMIT 5;';
  RAISE NOTICE '🎯 Run: SELECT * FROM "VIPCustomers" LIMIT 5;';
END $$;
