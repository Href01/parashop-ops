-- Explicit payment facts. Sendit amount is COD only and is zero for prepaid orders.
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "paidAmount" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "paymentReference" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED';

ALTER TABLE "SenditStaging"
  ADD COLUMN IF NOT EXISTS "paidAmount" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "paymentReference" TEXT;

CREATE INDEX IF NOT EXISTS "idx_order_payment_status" ON "Order"("paymentStatus");
CREATE INDEX IF NOT EXISTS "idx_order_paid_at" ON "Order"("paidAt");

COMMENT ON COLUMN "Order"."paidAmount" IS 'Verified amount received from COD settlement or prepaid bank/card payment.';
COMMENT ON COLUMN "Order"."paidAt" IS 'Timestamp when the money was actually received.';
COMMENT ON COLUMN "Order"."paymentReference" IS 'Bank transfer, card or settlement reference.';
COMMENT ON COLUMN "Order"."paymentStatus" IS 'UNVERIFIED, PENDING, PAID, PARTIAL or REFUNDED.';
