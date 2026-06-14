-- Migration 013: Meta Marketing API sync fields on AdCampaign
-- Lets imported Meta campaigns be de-duped, linked to an Event + products,
-- and carry insight metrics. revenue = Meta pixel-attributed value; real
-- revenue still comes from event uplift at the Event level.
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "externalId" VARCHAR(100);   -- Meta campaign id
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "eventId" INTEGER;           -- direct link to Event
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "productIds" INTEGER[];      -- tagged products
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "impressions" INTEGER;
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "clicks" INTEGER;
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "lastSyncedAt" TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_adcampaign_external" ON "AdCampaign" ("platform","externalId") WHERE "externalId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_adcampaign_event" ON "AdCampaign" ("eventId");
