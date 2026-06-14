-- Migration 011: organic post performance on ContentItem (Instagram/TikTok)
-- A published ContentItem IS the organic post; these hold its metrics.
-- reach/views/clicks already exist.
ALTER TABLE "ContentItem" ADD COLUMN IF NOT EXISTS "permalink" VARCHAR(500);       -- post URL
ALTER TABLE "ContentItem" ADD COLUMN IF NOT EXISTS "externalId" VARCHAR(100);      -- platform media/video id (for API sync)
ALTER TABLE "ContentItem" ADD COLUMN IF NOT EXISTS "likes" INTEGER;
ALTER TABLE "ContentItem" ADD COLUMN IF NOT EXISTS "saves" INTEGER;
ALTER TABLE "ContentItem" ADD COLUMN IF NOT EXISTS "comments" INTEGER;
ALTER TABLE "ContentItem" ADD COLUMN IF NOT EXISTS "shares" INTEGER;
ALTER TABLE "ContentItem" ADD COLUMN IF NOT EXISTS "metricsSyncedAt" TIMESTAMP;    -- last API sync
