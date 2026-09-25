-- Additive, idempotent. No customer/order/storefront data is changed.
CREATE TABLE IF NOT EXISTS "SeoSearchDaily" (
  property text NOT NULL, day date NOT NULL,
  dataset text NOT NULL CHECK (dataset IN ('site','query','page','detail')),
  key text NOT NULL, query text NOT NULL DEFAULT '', page text NOT NULL DEFAULT '',
  country text NOT NULL, device text NOT NULL,
  clicks double precision NOT NULL CHECK (clicks >= 0),
  impressions double precision NOT NULL CHECK (impressions >= 0),
  position double precision NOT NULL CHECK (position >= 0),
  PRIMARY KEY (property, day, dataset, key)
);
CREATE INDEX IF NOT EXISTS seo_daily_report ON "SeoSearchDaily" (property, day, country, device, dataset);
CREATE TABLE IF NOT EXISTS "SeoImportDay" (
  property text NOT NULL, day date NOT NULL, dataset text NOT NULL,
  row_count integer NOT NULL, capped boolean NOT NULL DEFAULT false,
  imported_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (property, day, dataset)
);
CREATE TABLE IF NOT EXISTS "SeoSyncState" (
  property text PRIMARY KEY, run_id uuid NOT NULL, locked_until timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS "SeoSyncRun" (
  id uuid PRIMARY KEY, property text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz, status text NOT NULL DEFAULT 'running',
  days_imported integer NOT NULL DEFAULT 0, error_code text, message text
);
CREATE INDEX IF NOT EXISTS seo_runs_recent ON "SeoSyncRun" (property, started_at DESC);
CREATE TABLE IF NOT EXISTS "SeoTechnicalAudit" (
  property text NOT NULL, day date NOT NULL, checked_at timestamptz NOT NULL DEFAULT now(),
  report jsonb NOT NULL, PRIMARY KEY (property, day)
);
