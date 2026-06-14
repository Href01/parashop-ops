-- Migration 014: per-ad engagement metrics from Meta insights "actions"
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "likes" INTEGER;      -- post_reaction
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "saves" INTEGER;      -- onsite_conversion.post_save
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "comments" INTEGER;   -- comment
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "shares" INTEGER;     -- post (shares)
