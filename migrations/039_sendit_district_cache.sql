-- Persist Sendit destinations across serverless instances. An in-memory cache
-- was cold on every new Vercel function and downloaded all six API pages.
CREATE TABLE IF NOT EXISTS "SenditDistrictCache" (
  id INTEGER PRIMARY KEY,
  ville TEXT NOT NULL,
  name TEXT NOT NULL,
  "arabicName" TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  delais TEXT,
  "refreshedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_sendit_district_cache_name"
  ON "SenditDistrictCache" (name);
