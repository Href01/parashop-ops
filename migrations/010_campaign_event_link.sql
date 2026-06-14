-- Migration 010: link Event → Campaign + ensure AdCampaign is the source of ad spend
-- Date: 2026-06-14
-- Each event can have one or more dedicated campaigns.

ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "eventId" integer;

-- Helpful indexes for the new real-metrics queries
CREATE INDEX IF NOT EXISTS "idx_adcampaign_campaign" ON "AdCampaign" ("campaignId");
CREATE INDEX IF NOT EXISTS "idx_campaign_event" ON "Campaign" ("eventId");
