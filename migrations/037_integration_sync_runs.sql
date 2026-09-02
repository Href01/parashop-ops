-- Durable, low-volume diagnostics for external integrations.
-- One Sendit cron run per day is roughly 30 rows/month; retain 90 days in code.

CREATE TABLE IF NOT EXISTS "IntegrationSyncRun" (
  id BIGSERIAL PRIMARY KEY,
  integration VARCHAR(40) NOT NULL,
  "trigger" VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "finishedAt" TIMESTAMPTZ,
  "durationMs" INTEGER,
  "apiCalls" INTEGER NOT NULL DEFAULT 0,
  pulled INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  "ordersSynced" INTEGER NOT NULL DEFAULT 0,
  "statusesChanged" INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT integration_sync_run_status_check
    CHECK (status IN ('running', 'success', 'partial', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS "IntegrationSyncRun_integration_startedAt_idx"
  ON "IntegrationSyncRun" (integration, "startedAt" DESC);
