-- Add Sendit district ID to Order table
-- This stores the exact district_id from Sendit API, eliminating guesswork

ALTER TABLE "Order"
ADD COLUMN "senditDistrictId" INTEGER;

COMMENT ON COLUMN "Order"."senditDistrictId" IS 'Sendit district ID chosen by customer during checkout';

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS "idx_order_sendit_district" ON "Order"("senditDistrictId");
