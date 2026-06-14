-- Migration 015: isolated Sendit reconciliation staging table.
-- Does NOT alter any existing table. The whole import/reconcile/product-
-- assignment workflow runs here; only an explicit "promote" creates real
-- Order/OrderItem rows, so the live BOS is untouched until validated.
CREATE TABLE IF NOT EXISTS "SenditStaging" (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,           -- Sendit tracking code
  "senditStatus" TEXT,
  name TEXT, phone TEXT, "phoneKey" TEXT, city TEXT,
  amount NUMERIC,                      -- COD total
  fee NUMERIC,                         -- delivery fee
  "productsText" TEXT,                 -- Sendit free-text products
  reference TEXT,
  "senditCreatedAt" TIMESTAMP,
  "matchedOrderId" INTEGER,            -- existing BOS order (tracking/phone)
  "matchedUserId" INTEGER,             -- customer matched by phone
  "matchedCustomerName" TEXT,
  "assignedProducts" JSONB,            -- [{productId, quantity, price}]
  state TEXT,                          -- 'sendit_only' | 'matched' | 'mismatch'
  promoted BOOLEAN DEFAULT false,
  "promotedOrderId" INTEGER,
  "pulledAt" TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  "createdAt" TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_senditstaging_phonekey" ON "SenditStaging" ("phoneKey");
CREATE INDEX IF NOT EXISTS "idx_senditstaging_state" ON "SenditStaging" (state, promoted);
