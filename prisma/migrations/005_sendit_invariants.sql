-- One shipment and one promoted staging row may belong to only one order.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_order_sendit_tracking"
  ON "Order"("senditTrackingId")
  WHERE "senditTrackingId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_senditstaging_promoted_order"
  ON "SenditStaging"("promotedOrderId")
  WHERE "promotedOrderId" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sendit_promoted_owner_matches_link'
  ) THEN
    ALTER TABLE "SenditStaging"
      ADD CONSTRAINT "sendit_promoted_owner_matches_link"
      CHECK (
        NOT promoted
        OR "promotedOrderId" IS NULL
        OR "matchedOrderId" IS NULL
        OR "matchedOrderId" = "promotedOrderId"
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_payment_status_valid'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "order_payment_status_valid"
      CHECK ("paymentStatus" IN ('UNVERIFIED', 'PENDING', 'PAID', 'PARTIAL', 'REFUNDED'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_paid_amount_nonnegative'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "order_paid_amount_nonnegative"
      CHECK ("paidAmount" IS NULL OR "paidAmount" >= 0);
  END IF;
END $$;
