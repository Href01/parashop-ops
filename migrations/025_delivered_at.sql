-- Migration 025: real delivery date (deliveredAt) for cash-flow / "réalisé" reporting
--
-- WHY: every financial metric on the dashboard used to be attributed to the order's
-- CREATION month (o."createdAt"). But cash is collected on the DELIVERY date, which
-- can fall in a different month. So a parcel created 27 Jun and delivered 1 Jul shows
-- in Sendit's July cashflow but was invisible in BOS July — the two could never be
-- reconciled, and July's realized cash was understated. This adds a real delivery
-- timestamp so we can report "encaissé/livré" by delivery month, matching Sendit.
--
-- SAFETY:
--  1. Backfill uses the best real signal available, in priority:
--       capiDeliveredAt (Meta-confirmed delivery)  →  first 'DELIVERED' status-history
--       event  →  createdAt (legacy fallback, only for old orders with no delivery
--       trace; verified: ALL July+ delivered orders have a real date, so no recent
--       month is approximated).
--  2. A BEFORE trigger stamps deliveredAt = NOW() the moment an order becomes
--     DELIVERED, on EVERY code path (sync, manual edit, API) — so nothing is missed
--     and no application code needs to remember to set it. Idempotent: only sets it
--     when currently NULL, so a re-sync never moves the date.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveredAt" timestamptz;

-- Backfill existing delivered orders with the best real delivery date we can find.
UPDATE "Order" o
SET "deliveredAt" = COALESCE(
  o."capiDeliveredAt",
  (SELECT MIN(h."createdAt") FROM "OrderStatusHistory" h
     WHERE h."orderId" = o.id AND h."newStatus" = 'DELIVERED'),
  o."createdAt"
)
WHERE o."deliveredAt" IS NULL
  AND (o.status::text = 'DELIVERED' OR o."senditStatus" = 'DELIVERED');

CREATE INDEX IF NOT EXISTS "Order_deliveredAt_idx" ON "Order" ("deliveredAt");

-- Stamp deliveredAt automatically whenever an order first becomes delivered.
CREATE OR REPLACE FUNCTION stamp_delivered_at() RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status::text = 'DELIVERED' OR NEW."senditStatus" = 'DELIVERED')
     AND NEW."deliveredAt" IS NULL THEN
    NEW."deliveredAt" := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_stamp_delivered_at ON "Order";
CREATE TRIGGER trigger_stamp_delivered_at
BEFORE INSERT OR UPDATE ON "Order"
FOR EACH ROW
EXECUTE FUNCTION stamp_delivered_at();
