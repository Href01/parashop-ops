-- Migration 017: key-value app settings (e.g. manually-set weekly revenue goal)
CREATE TABLE IF NOT EXISTS "AppSetting" (
  key TEXT PRIMARY KEY,
  value TEXT,
  "updatedAt" TIMESTAMP DEFAULT NOW()
);
INSERT INTO "AppSetting" (key, value) VALUES ('weeklyGoal', '42000') ON CONFLICT (key) DO NOTHING;
