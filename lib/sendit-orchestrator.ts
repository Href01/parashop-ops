import pool from '@/lib/db'
import { bustCache } from '@/lib/ops-cache'
import { pullSenditStaging, syncMatchedSenditStaging } from '@/lib/sendit-staging-sync'

type SyncTrigger = 'cron' | 'manual'
type SyncStatus = 'success' | 'partial' | 'failed' | 'skipped'

export interface SenditOrchestrationResult {
  ok: boolean
  status: SyncStatus
  runId: number | null
  skippedReason?: 'already-running' | 'recent-success'
  apiCalls: number
  retries: number
  pulled: number
  inserted: number
  updated: number
  ordersChecked: number
  ordersSynced: number
  statusesChanged: number
  skipped: number
  failures: number
  warnings: number
  avoidedTrackingCalls: number
  durationMs: number
  error?: string
}

const emptyResult = (): SenditOrchestrationResult => ({
  ok: false,
  status: 'failed',
  runId: null,
  apiCalls: 0,
  retries: 0,
  pulled: 0,
  inserted: 0,
  updated: 0,
  ordersChecked: 0,
  ordersSynced: 0,
  statusesChanged: 0,
  skipped: 0,
  failures: 0,
  warnings: 0,
  avoidedTrackingCalls: 0,
  durationMs: 0,
})

export async function runSenditSync(options: { trigger: SyncTrigger; force?: boolean }): Promise<SenditOrchestrationResult> {
  const startedAt = Date.now()
  const result = emptyResult()
  const lockClient = await pool.connect()
  let locked = false
  let lockTransactionOpen = false

  try {
    // DATABASE_URL uses Neon/PgBouncer transaction pooling. Session advisory
    // locks can leak because unlock may reach another backend; an xact lock is
    // pinned to this transaction and always released on COMMIT/connection loss.
    await lockClient.query('BEGIN')
    lockTransactionOpen = true
    const lock = await lockClient.query<{ acquired: boolean }>(
      `SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired`,
      ['shine:sendit-sync']
    )
    locked = Boolean(lock.rows[0]?.acquired)
    if (!locked) {
      await lockClient.query('ROLLBACK')
      lockTransactionOpen = false
      return { ...result, ok: true, status: 'skipped', skippedReason: 'already-running', durationMs: Date.now() - startedAt }
    }

    // Vercel can deliver the same cron event more than once. Skip a second full
    // history pull for six hours; a manual founder action remains forceable.
    if (options.trigger === 'cron' && !options.force) {
      const recent = await pool.query(
        `SELECT 1 FROM "IntegrationSyncRun"
         WHERE integration = 'sendit' AND status IN ('success', 'partial') AND failures = 0
           AND "finishedAt" > NOW() - INTERVAL '6 hours'
         LIMIT 1`
      )
      if (recent.rowCount) {
        return { ...result, ok: true, status: 'skipped', skippedReason: 'recent-success', durationMs: Date.now() - startedAt }
      }
    }

    const active = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM "Order"
       WHERE "senditTrackingId" IS NOT NULL
         AND status NOT IN ('DELIVERED', 'CANCELLED')`
    )
    result.avoidedTrackingCalls = Number(active.rows[0]?.count) || 0

    const run = await pool.query<{ id: number }>(
      `INSERT INTO "IntegrationSyncRun" (integration, "trigger", status)
       VALUES ('sendit', $1, 'running') RETURNING id`,
      [options.trigger]
    )
    result.runId = Number(run.rows[0].id)

    const pulled = await pullSenditStaging()
    result.apiCalls = pulled.apiCalls
    result.retries = pulled.retries
    result.pulled = pulled.pulled
    result.inserted = pulled.inserted
    result.updated = pulled.updated

    const synced = await syncMatchedSenditStaging()
    result.ordersChecked = synced.checked
    result.ordersSynced = synced.synced
    result.statusesChanged = synced.statusChanged
    result.skipped = synced.skipped
    result.failures = synced.failed.length
    result.warnings = synced.warnings.length
    result.status = result.failures || result.warnings ? 'partial' : 'success'
    result.ok = result.failures === 0
    result.durationMs = Date.now() - startedAt

    await pool.query(
      `UPDATE "IntegrationSyncRun"
       SET status = $2, "finishedAt" = NOW(), "durationMs" = $3,
           "apiCalls" = $4, pulled = $5, inserted = $6, updated = $7,
           "ordersSynced" = $8, "statusesChanged" = $9, skipped = $10,
           failures = $11, details = $12::jsonb
       WHERE id = $1`,
      [
        result.runId, result.status, result.durationMs, result.apiCalls,
        result.pulled, result.inserted, result.updated, result.ordersSynced,
        result.statusesChanged, result.skipped, result.failures,
        JSON.stringify({
          ordersChecked: result.ordersChecked,
          warnings: synced.warnings,
          failed: synced.failed,
          avoidedTrackingCalls: result.avoidedTrackingCalls,
          retries: result.retries,
          authCalls: pulled.authCalls,
          pages: pulled.pages,
        }),
      ]
    )

    bustCache('orders:')
    bustCache('dashboard-stats:')
    bustCache('sendit-staging')
    return result
  } catch (error) {
    result.status = 'failed'
    result.error = error instanceof Error ? error.message : 'unknown'
    result.durationMs = Date.now() - startedAt
    result.failures = Math.max(1, result.failures)
    if (result.runId) {
      await pool.query(
        `UPDATE "IntegrationSyncRun"
         SET status = 'failed', "finishedAt" = NOW(), "durationMs" = $2,
             "apiCalls" = $3, pulled = $4, inserted = $5, updated = $6,
             failures = $7, error = $8
         WHERE id = $1`,
        [result.runId, result.durationMs, result.apiCalls, result.pulled, result.inserted, result.updated, result.failures, result.error]
      ).catch(() => {})
    }
    return result
  } finally {
    if (lockTransactionOpen) {
      await lockClient.query(locked ? 'COMMIT' : 'ROLLBACK').catch(() => {})
    }
    // At daily frequency this keeps at most ~90 tiny rows without another service.
    await pool.query(
      `DELETE FROM "IntegrationSyncRun" WHERE integration = 'sendit' AND "startedAt" < NOW() - INTERVAL '90 days'`
    ).catch(() => {})
    lockClient.release()
  }
}
