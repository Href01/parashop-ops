-- Persist the Sendit delivery event used by cash reporting.
ALTER TABLE "SenditStaging"
  ADD COLUMN IF NOT EXISTS "lastActionAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "idx_senditstaging_status_created"
  ON "SenditStaging"("senditStatus", "senditCreatedAt");

CREATE INDEX IF NOT EXISTS "idx_senditstaging_status_last_action"
  ON "SenditStaging"("senditStatus", "lastActionAt");

COMMENT ON COLUMN "SenditStaging"."lastActionAt" IS
  'Latest Sendit shipment action; for DELIVERED rows this is the delivery event used by cash reporting.';
