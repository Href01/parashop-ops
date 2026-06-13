-- Migration 008: Content can promote multiple products
-- Date: 2026-06-13
-- Adds productIds[] array, backfills from single productId.

ALTER TABLE "ContentItem" ADD COLUMN IF NOT EXISTS "productIds" integer[] DEFAULT '{}';

UPDATE "ContentItem"
SET "productIds" = ARRAY["productId"]
WHERE "productId" IS NOT NULL
  AND ("productIds" IS NULL OR cardinality("productIds") = 0);
