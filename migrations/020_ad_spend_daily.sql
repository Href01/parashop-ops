-- Migration 020: per-day ad spend, so ROAS can be computed for any period.
-- AdCampaign.spend is cumulative-per-campaign (time_increment=all_days) and can't be
-- sliced by date. This table stores one row per campaign per day (time_increment=1),
-- letting the analytics ROAS sum the real spend over the selected window.
CREATE TABLE IF NOT EXISTS "AdSpendDaily" (
  id            SERIAL PRIMARY KEY,
  date          DATE NOT NULL,
  platform      VARCHAR(20) NOT NULL DEFAULT 'Meta',
  "externalId"  VARCHAR(64) NOT NULL,
  "campaignName" TEXT,
  spend         DECIMAL(12,2) NOT NULL DEFAULT 0,
  revenue       DECIMAL(12,2) NOT NULL DEFAULT 0,
  impressions   INTEGER NOT NULL DEFAULT 0,
  clicks        INTEGER NOT NULL DEFAULT 0,
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, "externalId", date)
);
CREATE INDEX IF NOT EXISTS "AdSpendDaily_date_idx" ON "AdSpendDaily" (date);
CREATE INDEX IF NOT EXISTS "AdSpendDaily_platform_date_idx" ON "AdSpendDaily" (platform, date);
