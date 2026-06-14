import pool from '@/lib/db'

/**
 * Meta (Facebook) Marketing API token storage.
 * Source of truth is the "IntegrationToken" row (provider='meta'), so the
 * weekly refresh can persist an extended token. The env META_ACCESS_TOKEN
 * bootstraps it on first use.
 *
 * Note: the durable production answer is a System User token (never expires) —
 * drop it in env/DB once and it just works. The refresh cron is a best-effort
 * extender for ordinary long-lived user tokens.
 */

const PROVIDER = 'meta'

export async function getMetaToken(): Promise<string | null> {
  try {
    const r = await pool.query<{ token: string }>(`SELECT token FROM "IntegrationToken" WHERE provider = $1`, [PROVIDER])
    if (r.rows[0]?.token) return r.rows[0].token
  } catch {
    // table missing → env fallback
  }
  return process.env.META_ACCESS_TOKEN || null
}

export async function saveMetaToken(token: string, expiresInSeconds?: number): Promise<void> {
  const expiresAt = expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : null
  await pool.query(
    `INSERT INTO "IntegrationToken" (provider, token, "refreshedAt", "expiresAt", "updatedAt")
     VALUES ($1, $2, NOW(), $3, NOW())
     ON CONFLICT (provider) DO UPDATE SET token = EXCLUDED.token, "refreshedAt" = NOW(), "expiresAt" = EXCLUDED."expiresAt", "updatedAt" = NOW()`,
    [PROVIDER, token, expiresAt]
  )
}
