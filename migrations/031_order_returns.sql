-- 031_order_returns.sql
-- Return / exchange tagging on orders. On Sendit the founder can request a replacement:
-- send the new product, get the old one back, Sendit bills a delivery. We tag the order,
-- store the (manually entered) return delivery fee, and optionally restock the returned
-- product. The fee feeds the P&L (Rentabilité + Trésorerie) as a "Retours/échanges" cost.
--
-- Dedicated column (not the profit formula's returnOrFailedFees) to avoid any double-count.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "returnedAt"        TIMESTAMPTZ;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "returnDeliveryFee" NUMERIC;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "returnRestocked"   BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS order_returned_at_idx ON "Order" ("returnedAt") WHERE "returnedAt" IS NOT NULL;
