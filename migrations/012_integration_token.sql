-- Migration 012: store refreshable integration tokens (Instagram, …) in DB
-- so a scheduled job can auto-refresh them before they expire (60 days for IG).
CREATE TABLE IF NOT EXISTS "IntegrationToken" (
  provider TEXT PRIMARY KEY,            -- 'instagram'
  token TEXT NOT NULL,
  "refreshedAt" TIMESTAMP DEFAULT NOW(),
  "expiresAt" TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT NOW()
);
