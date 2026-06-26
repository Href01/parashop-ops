-- Migration 021: idempotency flag for the Meta CAPI "Delivered" conversion.
-- Set the first time an order transitions to DELIVERED and we send the offline
-- "Delivered" event to Meta, so a re-sync never double-fires it.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "capiDeliveredAt" TIMESTAMPTZ;
