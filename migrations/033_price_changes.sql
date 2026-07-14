-- 033_price_changes.sql
-- Price change history + impact analysis. Product.price is edited from several places
-- (main site admin, direct SQL), so we capture every change with a DB trigger — no app
-- code can be the single choke point. Historical changes are backfilled from OrderItem
-- (the real selling price is stored per line). Impact metrics (units, revenue, margin,
-- conversion, elasticity) are computed on the fly from OrderItem + AnalyticsEvent.

CREATE TABLE IF NOT EXISTS "PriceChange" (
  id          SERIAL PRIMARY KEY,
  "productId" INTEGER NOT NULL REFERENCES "Product"(id) ON DELETE CASCADE,
  "oldPrice"  NUMERIC,
  "newPrice"  NUMERIC NOT NULL,
  "changedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "changedBy" TEXT,
  source      TEXT NOT NULL DEFAULT 'auto',   -- 'auto' (trigger) | 'backfill' | 'admin'
  note        TEXT
);
CREATE INDEX IF NOT EXISTS price_change_product_idx ON "PriceChange" ("productId", "changedAt" DESC);

-- Log any price change on Product, whatever the source (app, admin, raw SQL).
CREATE OR REPLACE FUNCTION log_price_change() RETURNS trigger AS $$
BEGIN
  IF NEW.price IS DISTINCT FROM OLD.price THEN
    INSERT INTO "PriceChange" ("productId", "oldPrice", "newPrice", "changedAt", source)
    VALUES (NEW.id, OLD.price, NEW.price, NOW(), 'auto');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_price_change ON "Product";
CREATE TRIGGER trg_log_price_change
  AFTER UPDATE OF price ON "Product"
  FOR EACH ROW EXECUTE FUNCTION log_price_change();
