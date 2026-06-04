-- Add Sendit integration fields to Order table
-- Migration: 005_add_sendit_fields.sql

ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "senditTrackingId" TEXT,
ADD COLUMN IF NOT EXISTS "senditBarcode" TEXT,
ADD COLUMN IF NOT EXISTS "senditStatus" TEXT,
ADD COLUMN IF NOT EXISTS "actualDeliveryCost" DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS "websiteOrderId" TEXT UNIQUE;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS "idx_order_sendit_tracking" ON "Order"("senditTrackingId");
CREATE INDEX IF NOT EXISTS "idx_order_website_id" ON "Order"("websiteOrderId");

-- Add comment
COMMENT ON COLUMN "Order"."senditTrackingId" IS 'Sendit delivery partner tracking ID';
COMMENT ON COLUMN "Order"."websiteOrderId" IS 'Reference to order ID from main website (for webhook sync)';
