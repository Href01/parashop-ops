-- 030_goal_targets.sql
-- Smart goal card: remember the target set for each period (ISO week / month) so we
-- build a track record over time. The "actual" is always recomputed from orders
-- (never snapshotted) — so numbers stay exact and no cron is needed.
--
-- periodKey format:  week = 'IYYY-Www' (e.g. 2026-W28) · month = 'YYYY-MM' (e.g. 2026-07)
-- Both formats sort lexically, which lets us carry a target forward to later periods.

CREATE TABLE IF NOT EXISTS "GoalTarget" (
  id          SERIAL PRIMARY KEY,
  kind        TEXT NOT NULL,          -- 'week' | 'month'
  "periodKey" TEXT NOT NULL,
  target      INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT goal_target_uniq UNIQUE (kind, "periodKey")
);

CREATE INDEX IF NOT EXISTS goal_target_kind_key_idx ON "GoalTarget" (kind, "periodKey");
