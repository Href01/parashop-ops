import 'server-only'
import { randomUUID } from 'node:crypto'
import { saveDay, CLAIM_SQL } from './persistence'
import pool from '@/lib/db'
import {
  PROPERTY,
  connectionStatus,
  SeoError,
  getGoogleRequest,
  latestFinalDay,
  fetchDay,
  inspectPriorityUrls,
} from './google'
import {
  DATASETS,
  daysBetween,
  makeReport,
  pacificDay,
  shiftDay,
  type Filters,
  type ImportDay,
  type SearchRow,
} from './model'
import { auditTechnical, reusableAudit, type TechnicalReport } from './technical'

export async function schemaReady() {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [
      [
        'SeoSearchDaily',
        'SeoImportDay',
        'SeoSyncState',
        'SeoSyncRun',
        'SeoTechnicalAudit',
      ],
    ],
  )
  return r.rows[0].n === 5
}
export async function dashboard(filters: Filters) {
  const connection = connectionStatus()
  if (!(await schemaReady()))
    return {
      connection,
      schemaReady: false,
      report: null,
      runs: [],
      audit: null,
      previousAudit: null,
      latestDay: null,
    }
  const [latest, runs, audits] = await Promise.all([
    pool.query(
      `SELECT max(day)::text AS day FROM (SELECT day FROM "SeoImportDay" WHERE property=$1 GROUP BY day HAVING COUNT(DISTINCT dataset)=4) d`,
      [PROPERTY],
    ),
    pool.query(
      `SELECT id, started_at, finished_at, status, days_imported, error_code, message FROM "SeoSyncRun" WHERE property=$1 ORDER BY started_at DESC LIMIT 8`,
      [PROPERTY],
    ),
    pool.query(
      `SELECT report FROM "SeoTechnicalAudit" WHERE property=$1 ORDER BY day DESC LIMIT 2`,
      [PROPERTY],
    ),
  ])
  const end: string | null = latest.rows[0].day
  const base = {
    connection,
    schemaReady: true,
    runs: runs.rows,
    audit: (audits.rows[0]?.report ?? null) as TechnicalReport | null,
    previousAudit: (audits.rows[1]?.report ?? null) as TechnicalReport | null,
    latestDay: end,
  }
  if (!end) return { ...base, report: null }
  const start = shiftDay(end, 1 - filters.days * 2)
  const [rows, imports] = await Promise.all([
    pool.query(
      `SELECT day::text, dataset, query, page, country, device, clicks, impressions, position FROM "SeoSearchDaily"
      WHERE property=$1 AND day BETWEEN $2 AND $3 AND ($4='all' OR country=$4) AND ($5='all' OR device=$5)
      ORDER BY day DESC, dataset, key LIMIT 100001`,
      [PROPERTY, start, end, filters.country, filters.device],
    ),
    pool.query(
      `SELECT day::text, dataset, capped FROM "SeoImportDay" WHERE property=$1 AND day BETWEEN $2 AND $3`,
      [PROPERTY, start, end],
    ),
  ])
  return {
    ...base,
    report: makeReport(
      rows.rows.slice(0, 100000) as SearchRow[],
      imports.rows as ImportDay[],
      end,
      filters,
      rows.rows.length > 100000,
    ),
  }
}
export type SeoDashboard = Awaited<ReturnType<typeof dashboard>>

export async function synchronize(mode: 'all' | 'audit' = 'all') {
  if (!(await schemaReady()))
    throw new SeoError(
      'schema_missing',
      'Appliquez la migration 043_seo_insights.sql avant la collecte.',
      409,
    )
  if (mode === 'all' && !connectionStatus().configured)
    throw new SeoError(
      'not_configured',
      'L’accès Google serveur n’est pas encore configuré.',
      409,
    )
  const id = randomUUID()
  const claim = await pool.query(CLAIM_SQL, [PROPERTY, id])
  if (!claim.rowCount)
    throw new SeoError(
      'already_running',
      'Une synchronisation est déjà en cours. Réessayez après sa fin.',
      409,
    )
  let count = 0
  let error: SeoError | null = null
  let pending = 0
  let auditIncomplete = false
  const deadline = Date.now() + 240_000
  try {
    // Timed-out serverless executions are visible, not permanently shown as running.
    await pool.query(
      `UPDATE "SeoSyncRun" SET status='interrupted',finished_at=now(),message='Exécution interrompue, reprise automatique au prochain passage.' WHERE property=$1 AND status='running'`,
      [PROPERTY],
    )
    await pool.query(`INSERT INTO "SeoSyncRun" (id,property) VALUES ($1,$2)`, [
      id,
      PROPERTY,
    ])
    if (mode === 'all') {
      try {
        const request = await getGoogleRequest(deadline - 110_000)
        const today = pacificDay()
        const end = await latestFinalDay(request, shiftDay(today, -10), today)
        if (!end)
          throw new SeoError(
            'no_final_data',
            'Google ne fournit pas encore de journée finalisée sur les dix derniers jours.',
          )
        const oldest = shiftDay(end, -55)
        const done = await pool.query(
          `SELECT day::text FROM "SeoImportDay" WHERE property=$1 AND day BETWEEN $2 AND $3 GROUP BY day HAVING COUNT(DISTINCT dataset)=4`,
          [PROPERTY, oldest, end],
        )
        const imported = new Set(done.rows.map((r) => r.day as string))
        // Refresh the latest 3 final days, then progressively backfill 56 days.
        const targets = [
          ...new Set([
            end,
            shiftDay(end, -1),
            shiftDay(end, -2),
            ...daysBetween(oldest, end)
              .reverse()
              .filter((d) => !imported.has(d)),
          ]),
        ]
        pending = targets.length
        for (const day of targets.slice(0, 10)) {
          if (Date.now() > deadline - 115_000) break
          const batches = []
          for (const dataset of DATASETS)
            batches.push(await fetchDay(request, day, dataset))
          await saveDay(await pool.connect(), PROPERTY, day, batches)
          count++
          pending--
        }
      } catch (e) {
        error =
          e instanceof SeoError
            ? e
            : new SeoError(
                'sync_failed',
                'Échec de la synchronisation. Les journées déjà validées sont conservées.',
              )
      }
    }
    const recentAudit = mode === 'all'
      ? await pool.query(`SELECT report FROM "SeoTechnicalAudit" WHERE property=$1 ORDER BY checked_at DESC LIMIT 1`, [PROPERTY])
      : null
    // Backfill batches share a recent complete audit. Explicit audit always reruns.
    if (reusableAudit(recentAudit?.rows[0]?.report ?? null)) {
      auditIncomplete = false
    } else if (Date.now() < deadline - 10_000) {
      const audit = await auditTechnical(
        Math.min(deadline - 50_000, Date.now() + 95_000),
      )
      try {
        audit.indexing = await inspectPriorityUrls(deadline - 5000)
      } catch {
        audit.indexing = []
        auditIncomplete = true
      }
      await pool.query(
        `INSERT INTO "SeoTechnicalAudit" (property,day,report) VALUES ($1,$2,$3::jsonb)
        ON CONFLICT (property,day) DO UPDATE SET report=excluded.report,checked_at=now()`,
        [PROPERTY, pacificDay(), JSON.stringify(audit)],
      )
      auditIncomplete =
        auditIncomplete ||
        !audit.complete ||
        !!audit.indexing?.some((item) => item.error)
    } else {
      auditIncomplete = true
    }
    const status = error
      ? count
        ? 'partial'
        : 'failed'
      : auditIncomplete
        ? 'partial'
        : pending
          ? 'backfilling'
          : 'succeeded'
    const message =
      error?.message ||
      (auditIncomplete
        ? 'Collecte terminée avec un contrôle technique incomplet. Consultez Santé technique et relancez le contrôle.'
        : pending
          ? `${pending} journées restent à importer. Reprise au prochain passage.`
          : mode === 'audit'
            ? 'Contrôle technique terminé.'
            : 'Collecte terminée.')
    await pool.query(
      `UPDATE "SeoSyncRun" SET status=$2,finished_at=now(),days_imported=$3,error_code=$4,message=$5 WHERE id=$1`,
      [id, status, count, error?.code ?? null, message],
    )
    return { status, daysImported: count, remainingDays: pending, message }
  } catch {
    await pool
      .query(
        `UPDATE "SeoSyncRun" SET status='failed',finished_at=now(),days_imported=$2,error_code='storage_error',message='Erreur de stockage. Vérifiez la connexion à la base.' WHERE id=$1`,
        [id, count],
      )
      .catch(() => undefined)
    throw new SeoError(
      'storage_error',
      'Erreur de stockage. Les données déjà validées sont conservées.',
    )
  } finally {
    await pool.query(
      `UPDATE "SeoSyncState" SET locked_until=now() WHERE property=$1 AND run_id=$2`,
      [PROPERTY, id],
    )
  }
}
