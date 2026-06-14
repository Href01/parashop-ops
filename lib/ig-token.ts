import pool from '@/lib/db'

/**
 * Instagram token storage.
 * Source of truth is the "IntegrationToken" DB row (so the scheduled refresh can
 * persist a new 60-day token). On first use the env IG_ACCESS_TOKEN bootstraps it.
 */

const PROVIDER = 'instagram'

/** Returns the active IG token: DB row if present, otherwise the env bootstrap. */
export async function getInstagramToken(): Promise<string | null> {
  try {
    const r = await pool.query<{ token: string }>(`SELECT token FROM "IntegrationToken" WHERE provider = $1`, [PROVIDER])
    if (r.rows[0]?.token) return r.rows[0].token
  } catch {
    // table may not exist yet → fall back to env
  }
  return process.env.IG_ACCESS_TOKEN || null
}

/** Upserts the IG token (called after a refresh, with a fresh 60-day token). */
export async function saveInstagramToken(token: string, expiresInSeconds?: number): Promise<void> {
  const expiresAt = expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : null
  await pool.query(
    `INSERT INTO "IntegrationToken" (provider, token, "refreshedAt", "expiresAt", "updatedAt")
     VALUES ($1, $2, NOW(), $3, NOW())
     ON CONFLICT (provider) DO UPDATE SET token = EXCLUDED.token, "refreshedAt" = NOW(), "expiresAt" = EXCLUDED."expiresAt", "updatedAt" = NOW()`,
    [PROVIDER, token, expiresAt]
  )
}
