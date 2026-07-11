-- ================================================================
-- Migration 003: Campaigns + Events with P&L Tracking
-- ================================================================
-- For e-commerce beauty products in Morocco
-- Track ad costs, product performance, real profit after margins
-- ================================================================

-- ================================================================
-- CAMPAIGNS MODULE
-- ================================================================

-- Main campaign table
CREATE TABLE IF NOT EXISTS "Campaign" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'Draft', -- Draft, Active, Completed, Paused
  "startDate" TIMESTAMP,
  "endDate" TIMESTAMP,

  -- Targets
  "targetRevenue" DECIMAL(10,2),
  "targetOrders" INTEGER,

  -- Budget allocation
  "budgetTotal" DECIMAL(10,2),
  "budgetAdSpend" DECIMAL(10,2),
  "budgetOther" DECIMAL(10,2),

  -- Team
  "createdBy" TEXT,
  "assignedTo" TEXT[], -- Multiple team members

  -- Metadata
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Campaign → Products (which products are promoted)
CREATE TABLE IF NOT EXISTS "CampaignProduct" (
  "id" SERIAL PRIMARY KEY,
  "campaignId" INTEGER NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
  "productId" INTEGER NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,

  -- Targets for this product in campaign
  "targetSales" INTEGER,
  "targetRevenue" DECIMAL(10,2),

  -- Special pricing for campaign
  "discountPercent" DECIMAL(5,2),
  "specialPrice" DECIMAL(10,2),

  -- Performance (calculated)
  "actualSales" INTEGER DEFAULT 0,
  "actualRevenue" DECIMAL(10,2) DEFAULT 0,

  UNIQUE("campaignId", "productId")
);

-- Campaign costs (ad spend, influencer, content creation)
CREATE TABLE IF NOT EXISTS "CampaignCost" (
  "id" SERIAL PRIMARY KEY,
  "campaignId" INTEGER NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,

  -- Cost type
  "type" TEXT NOT NULL, -- Meta Ads, Google Ads, TikTok Ads, Snapchat Ads, Influencer, Content Creation, Photography, Other
  "platform" TEXT, -- Facebook, Instagram, Google, TikTok, etc.
  "description" TEXT,

  -- Amount
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT DEFAULT 'MAD',

  -- When
  "date" TIMESTAMP DEFAULT NOW(),
  "addedBy" TEXT,

  -- Proof/tracking
  "receiptUrl" TEXT,
  "notes" TEXT,

  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Campaign posts/content tracking
CREATE TABLE IF NOT EXISTS "CampaignPost" (
  "id" SERIAL PRIMARY KEY,
  "campaignId" INTEGER NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,

  -- Post details
  "platform" TEXT NOT NULL, -- Instagram, Facebook, TikTok, Snapchat
  "type" TEXT, -- Story, Reel, Post, Ad, Video
  "url" TEXT,
  "caption" TEXT,

  -- Performance metrics (manual input or API)
  "reach" INTEGER,
  "impressions" INTEGER,
  "engagement" INTEGER,
  "clicks" INTEGER,
  "conversions" INTEGER,

  -- Dates
  "publishedAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Campaign metrics (auto-calculated)
CREATE TABLE IF NOT EXISTS "CampaignMetrics" (
  "id" SERIAL PRIMARY KEY,
  "campaignId" INTEGER NOT NULL UNIQUE REFERENCES "Campaign"("id") ON DELETE CASCADE,

  -- Revenue
  "totalOrders" INTEGER DEFAULT 0,
  "totalRevenue" DECIMAL(10,2) DEFAULT 0,
  "totalUnits" INTEGER DEFAULT 0,
  "avgOrderValue" DECIMAL(10,2) DEFAULT 0,

  -- Costs
  "totalCOGS" DECIMAL(10,2) DEFAULT 0, -- Cost of goods sold (sum of costPrice * qty)
  "totalAdSpend" DECIMAL(10,2) DEFAULT 0,
  "totalOtherCosts" DECIMAL(10,2) DEFAULT 0,
  "totalCosts" DECIMAL(10,2) DEFAULT 0, -- COGS + adSpend + otherCosts

  -- Profit
  "grossProfit" DECIMAL(10,2) DEFAULT 0, -- Revenue - COGS
  "netProfit" DECIMAL(10,2) DEFAULT 0, -- Gross profit - adSpend - otherCosts

  -- ROI metrics
  "roi" DECIMAL(10,2), -- (netProfit / totalCosts) * 100
  "roas" DECIMAL(10,2), -- Revenue / adSpend (Return on ad spend)
  "profitMargin" DECIMAL(5,2), -- (netProfit / totalRevenue) * 100

  -- Last calculated
  "calculatedAt" TIMESTAMP DEFAULT NOW()
);

-- ================================================================
-- EVENTS MODULE
-- ================================================================

-- Main event table (Ramadan, Black Friday, Mother's Day, etc.)
CREATE TABLE IF NOT EXISTS "Event" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" TEXT NOT NULL, -- Ramadan, Black Friday, Mother's Day, Summer Sale, Flash Sale, Custom
  "status" TEXT NOT NULL DEFAULT 'Upcoming', -- Upcoming, Active, Completed

  -- Dates
  "startDate" TIMESTAMP NOT NULL,
  "endDate" TIMESTAMP NOT NULL,

  -- Discount rules
  "discountType" TEXT, -- Percentage, Fixed Amount, Buy X Get Y
  "discountValue" DECIMAL(10,2),
  "minOrderAmount" DECIMAL(10,2), -- Minimum order for discount

  -- Targets
  "targetRevenue" DECIMAL(10,2),
  "targetOrders" INTEGER,

  -- Team
  "createdBy" TEXT,

  -- Metadata
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Event → Categories (which categories are featured)
CREATE TABLE IF NOT EXISTS "EventCategory" (
  "id" SERIAL PRIMARY KEY,
  "eventId" INTEGER NOT NULL REFERENCES "Event"("id") ON DELETE CASCADE,
  "category" TEXT NOT NULL,

  -- Performance (calculated)
  "orders" INTEGER DEFAULT 0,
  "revenue" DECIMAL(10,2) DEFAULT 0,
  "units" INTEGER DEFAULT 0,

  UNIQUE("eventId", "category")
);

-- Event → Products (which products are featured/discounted)
CREATE TABLE IF NOT EXISTS "EventProduct" (
  "id" SERIAL PRIMARY KEY,
  "eventId" INTEGER NOT NULL REFERENCES "Event"("id") ON DELETE CASCADE,
  "productId" INTEGER NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,

  -- Special pricing
  "specialPrice" DECIMAL(10,2),
  "discountPercent" DECIMAL(5,2),

  -- Featured?
  "isFeatured" BOOLEAN DEFAULT FALSE,
  "displayOrder" INTEGER,

  -- Performance (calculated)
  "orders" INTEGER DEFAULT 0,
  "revenue" DECIMAL(10,2) DEFAULT 0,
  "units" INTEGER DEFAULT 0,

  UNIQUE("eventId", "productId")
);

-- Event metrics (auto-calculated)
CREATE TABLE IF NOT EXISTS "EventMetrics" (
  "id" SERIAL PRIMARY KEY,
  "eventId" INTEGER NOT NULL UNIQUE REFERENCES "Event"("id") ON DELETE CASCADE,

  -- Overall performance
  "totalOrders" INTEGER DEFAULT 0,
  "totalRevenue" DECIMAL(10,2) DEFAULT 0,
  "totalUnits" INTEGER DEFAULT 0,
  "avgOrderValue" DECIMAL(10,2) DEFAULT 0,

  -- Top performers
  "topCategory" TEXT,
  "topCategoryRevenue" DECIMAL(10,2),
  "topProduct" TEXT,
  "topProductRevenue" DECIMAL(10,2),

  -- Comparison vs normal period (same duration before event)
  "normalPeriodRevenue" DECIMAL(10,2),
  "normalPeriodOrders" INTEGER,
  "revenueIncrease" DECIMAL(10,2), -- % increase
  "ordersIncrease" DECIMAL(10,2), -- % increase

  -- Last calculated
  "calculatedAt" TIMESTAMP DEFAULT NOW()
);

-- ================================================================
-- ORDER TABLE ADDITIONS
-- ================================================================

-- Add campaign and event tracking to orders
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "campaignId" INTEGER REFERENCES "Campaign"("id") ON DELETE SET NULL;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "eventId" INTEGER REFERENCES "Event"("id") ON DELETE SET NULL;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "utmSource" TEXT; -- Where did they come from?
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "utmMedium" TEXT; -- social, cpc, email, etc.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "utmCampaign" TEXT; -- Campaign name from URL
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "utmContent" TEXT; -- Which ad/post?

-- ================================================================
-- INDEXES FOR PERFORMANCE
-- ================================================================

-- Campaign indexes
CREATE INDEX IF NOT EXISTS "idx_campaign_status" ON "Campaign"("status");
CREATE INDEX IF NOT EXISTS "idx_campaign_dates" ON "Campaign"("startDate", "endDate");
CREATE INDEX IF NOT EXISTS "idx_campaign_product" ON "CampaignProduct"("campaignId", "productId");
CREATE INDEX IF NOT EXISTS "idx_campaign_cost_campaign" ON "CampaignCost"("campaignId");

-- Event indexes
CREATE INDEX IF NOT EXISTS "idx_event_status" ON "Event"("status");
CREATE INDEX IF NOT EXISTS "idx_event_type" ON "Event"("type");
CREATE INDEX IF NOT EXISTS "idx_event_dates" ON "Event"("startDate", "endDate");
CREATE INDEX IF NOT EXISTS "idx_event_category" ON "EventCategory"("eventId", "category");
CREATE INDEX IF NOT EXISTS "idx_event_product" ON "EventProduct"("eventId", "productId");

-- Order attribution indexes
CREATE INDEX IF NOT EXISTS "idx_order_campaign" ON "Order"("campaignId");
CREATE INDEX IF NOT EXISTS "idx_order_event" ON "Order"("eventId");
CREATE INDEX IF NOT EXISTS "idx_order_utm_source" ON "Order"("utmSource");

-- ================================================================
-- HELPER FUNCTIONS
-- ================================================================

-- Function to calculate campaign metrics
CREATE OR REPLACE FUNCTION calculate_campaign_metrics(p_campaign_id INTEGER)
RETURNS VOID AS $$
DECLARE
  v_total_orders INTEGER;
  v_total_revenue DECIMAL(10,2);
  v_total_units INTEGER;
  v_total_cogs DECIMAL(10,2);
  v_total_ad_spend DECIMAL(10,2);
  v_total_other_costs DECIMAL(10,2);
BEGIN
  -- Get orders data
  SELECT
    COUNT(*),
    COALESCE(SUM(total), 0),
    COALESCE(SUM(oi.quantity), 0),
    COALESCE(SUM(oi.quantity * COALESCE(p."costPrice", 0)), 0)
  INTO v_total_orders, v_total_revenue, v_total_units, v_total_cogs
  FROM "Order" o
  LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
  LEFT JOIN "Product" p ON p.id = oi."productId"
  WHERE o."campaignId" = p_campaign_id
    AND o.status IN ('CONFIRMED', 'DELIVERED');

  -- Get ad spend
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_ad_spend
  FROM "CampaignCost"
  WHERE "campaignId" = p_campaign_id
    AND type IN ('Meta Ads', 'Google Ads', 'TikTok Ads', 'Snapchat Ads');

  -- Get other costs
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_other_costs
  FROM "CampaignCost"
  WHERE "campaignId" = p_campaign_id
    AND type NOT IN ('Meta Ads', 'Google Ads', 'TikTok Ads', 'Snapchat Ads');

  -- Insert or update metrics
  INSERT INTO "CampaignMetrics" (
    "campaignId",
    "totalOrders",
    "totalRevenue",
    "totalUnits",
    "avgOrderValue",
    "totalCOGS",
    "totalAdSpend",
    "totalOtherCosts",
    "totalCosts",
    "grossProfit",
    "netProfit",
    "roi",
    "roas",
    "profitMargin",
    "calculatedAt"
  ) VALUES (
    p_campaign_id,
    v_total_orders,
    v_total_revenue,
    v_total_units,
    CASE WHEN v_total_orders > 0 THEN v_total_revenue / v_total_orders ELSE 0 END,
    v_total_cogs,
    v_total_ad_spend,
    v_total_other_costs,
    v_total_cogs + v_total_ad_spend + v_total_other_costs,
    v_total_revenue - v_total_cogs,
    v_total_revenue - v_total_cogs - v_total_ad_spend - v_total_other_costs,
    CASE WHEN (v_total_cogs + v_total_ad_spend + v_total_other_costs) > 0
      THEN ((v_total_revenue - v_total_cogs - v_total_ad_spend - v_total_other_costs) / (v_total_cogs + v_total_ad_spend + v_total_other_costs)) * 100
      ELSE 0 END,
    CASE WHEN v_total_ad_spend > 0 THEN v_total_revenue / v_total_ad_spend ELSE 0 END,
    CASE WHEN v_total_revenue > 0
      THEN ((v_total_revenue - v_total_cogs - v_total_ad_spend - v_total_other_costs) / v_total_revenue) * 100
      ELSE 0 END,
    NOW()
  )
  ON CONFLICT ("campaignId") DO UPDATE SET
    "totalOrders" = EXCLUDED."totalOrders",
    "totalRevenue" = EXCLUDED."totalRevenue",
    "totalUnits" = EXCLUDED."totalUnits",
    "avgOrderValue" = EXCLUDED."avgOrderValue",
    "totalCOGS" = EXCLUDED."totalCOGS",
    "totalAdSpend" = EXCLUDED."totalAdSpend",
    "totalOtherCosts" = EXCLUDED."totalOtherCosts",
    "totalCosts" = EXCLUDED."totalCosts",
    "grossProfit" = EXCLUDED."grossProfit",
    "netProfit" = EXCLUDED."netProfit",
    "roi" = EXCLUDED."roi",
    "roas" = EXCLUDED."roas",
    "profitMargin" = EXCLUDED."profitMargin",
    "calculatedAt" = EXCLUDED."calculatedAt";
END;
$$ LANGUAGE plpgsql;

-- Function to calculate event metrics
CREATE OR REPLACE FUNCTION calculate_event_metrics(p_event_id INTEGER)
RETURNS VOID AS $$
DECLARE
  v_event RECORD;
  v_total_orders INTEGER;
  v_total_revenue DECIMAL(10,2);
  v_total_units INTEGER;
  v_normal_revenue DECIMAL(10,2);
  v_normal_orders INTEGER;
BEGIN
  -- Get event dates
  SELECT "startDate", "endDate" INTO v_event
  FROM "Event" WHERE id = p_event_id;

  -- Get event period performance
  SELECT
    COUNT(*),
    COALESCE(SUM(total), 0),
    COALESCE(SUM(oi.quantity), 0)
  INTO v_total_orders, v_total_revenue, v_total_units
  FROM "Order" o
  LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
  WHERE o."eventId" = p_event_id
    AND o.status IN ('CONFIRMED', 'DELIVERED')
    AND o."createdAt" BETWEEN v_event."startDate" AND v_event."endDate";

  -- Get normal period performance (same duration before event)
  SELECT
    COUNT(*),
    COALESCE(SUM(total), 0)
  INTO v_normal_orders, v_normal_revenue
  FROM "Order" o
  WHERE o.status IN ('CONFIRMED', 'DELIVERED')
    AND o."createdAt" BETWEEN
      (v_event."startDate" - (v_event."endDate" - v_event."startDate"))
      AND v_event."startDate";

  -- Insert or update metrics
  INSERT INTO "EventMetrics" (
    "eventId",
    "totalOrders",
    "totalRevenue",
    "totalUnits",
    "avgOrderValue",
    "normalPeriodRevenue",
    "normalPeriodOrders",
    "revenueIncrease",
    "ordersIncrease",
    "calculatedAt"
  ) VALUES (
    p_event_id,
    v_total_orders,
    v_total_revenue,
    v_total_units,
    CASE WHEN v_total_orders > 0 THEN v_total_revenue / v_total_orders ELSE 0 END,
    v_normal_revenue,
    v_normal_orders,
    CASE WHEN v_normal_revenue > 0
      THEN ((v_total_revenue - v_normal_revenue) / v_normal_revenue) * 100
      ELSE 0 END,
    CASE WHEN v_normal_orders > 0
      THEN ((v_total_orders - v_normal_orders)::DECIMAL / v_normal_orders) * 100
      ELSE 0 END,
    NOW()
  )
  ON CONFLICT ("eventId") DO UPDATE SET
    "totalOrders" = EXCLUDED."totalOrders",
    "totalRevenue" = EXCLUDED."totalRevenue",
    "totalUnits" = EXCLUDED."totalUnits",
    "avgOrderValue" = EXCLUDED."avgOrderValue",
    "normalPeriodRevenue" = EXCLUDED."normalPeriodRevenue",
    "normalPeriodOrders" = EXCLUDED."normalPeriodOrders",
    "revenueIncrease" = EXCLUDED."revenueIncrease",
    "ordersIncrease" = EXCLUDED."ordersIncrease",
    "calculatedAt" = EXCLUDED."calculatedAt";
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- DONE
-- ================================================================
