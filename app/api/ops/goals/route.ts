import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'

/**
 * Smart goals — a rolling ledger of weekly & monthly targets vs realised CA.
 *
 * The target set for each period is persisted in "GoalTarget" (so history survives
 * edits); the realised CA is recomputed on the fly from orders (CONFIRMED+DELIVERED,
 * by creation date, matching the dashboard's "CA confirmé + livré"). No snapshot, no
 * cron — always exact. When a period has no explicit target we carry the last one
 * forward, falling back to the AppSetting scalar (weeklyGoal / monthlyGoal).
 */

const TZ = 'Africa/Casablanca'
const DEFAULTS = { week: 42000, month: 180000 }
const REVENUE = `COALESCE(o."revenue", o."productsTotal", o.total::numeric, 0)`

function businessToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

async function guard() {
  const session = await getServerSession(authOptions)
  return !!session?.user?.email && isFounder(session.user.email)
}

async function scalarGoal(key: 'weeklyGoal' | 'monthlyGoal', fallback: number): Promise<number> {
  try {
    const r = await pool.query(`SELECT value FROM "AppSetting" WHERE key = $1`, [key])
    const v = Number(r.rows[0]?.value)
    return Number.isFinite(v) && v > 0 ? v : fallback
  } catch {
    return fallback
  }
}

type PeriodRow = { key: string; start: string; actual: number; orders: number }

/** Last `n` ISO weeks (Monday-based), oldest → newest, with realised CA per week. */
async function weekActuals(n: number, anchor: string): Promise<PeriodRow[]> {
  const r = await pool.query(`
    WITH span AS (
      SELECT generate_series(
        date_trunc('week', $2::date) - ($1 - 1) * INTERVAL '1 week',
        date_trunc('week', $2::date),
        INTERVAL '1 week'
      )::date AS pstart
    ),
    periods AS (
      SELECT pstart, (pstart + INTERVAL '7 days')::date AS pend, to_char(pstart, 'IYYY"-W"IW') AS key FROM span
    )
    SELECT p.key,
           to_char(p.pstart, 'YYYY-MM-DD') AS start,
           COALESCE(SUM(${REVENUE}) FILTER (WHERE o.status IN ('CONFIRMED','DELIVERED')), 0)::double precision AS actual,
           COUNT(o.id) FILTER (WHERE o.status IN ('CONFIRMED','DELIVERED'))::int AS orders
    FROM periods p
    LEFT JOIN "Order" o
      ON (o."createdAt" AT TIME ZONE '${TZ}')::date >= p.pstart
     AND (o."createdAt" AT TIME ZONE '${TZ}')::date <  p.pend
    GROUP BY p.key, p.pstart
    ORDER BY p.pstart
  `, [n, anchor])
  return r.rows.map((x) => ({ key: x.key, start: x.start, actual: x.actual, orders: x.orders }))
}

/** Last `n` months, oldest → newest, with realised CA per month. */
async function monthActuals(n: number, anchor: string): Promise<PeriodRow[]> {
  const r = await pool.query(`
    WITH span AS (
      SELECT generate_series(
        date_trunc('month', $2::date) - ($1 - 1) * INTERVAL '1 month',
        date_trunc('month', $2::date),
        INTERVAL '1 month'
      )::date AS pstart
    ),
    periods AS (
      SELECT pstart, (pstart + INTERVAL '1 month')::date AS pend, to_char(pstart, 'YYYY-MM') AS key FROM span
    )
    SELECT p.key,
           to_char(p.pstart, 'YYYY-MM-DD') AS start,
           COALESCE(SUM(${REVENUE}) FILTER (WHERE o.status IN ('CONFIRMED','DELIVERED')), 0)::double precision AS actual,
           COUNT(o.id) FILTER (WHERE o.status IN ('CONFIRMED','DELIVERED'))::int AS orders
    FROM periods p
    LEFT JOIN "Order" o
      ON (o."createdAt" AT TIME ZONE '${TZ}')::date >= p.pstart
     AND (o."createdAt" AT TIME ZONE '${TZ}')::date <  p.pend
    GROUP BY p.key, p.pstart
    ORDER BY p.pstart
  `, [n, anchor])
  return r.rows.map((x) => ({ key: x.key, start: x.start, actual: x.actual, orders: x.orders }))
}

async function targetsFor(kind: 'week' | 'month'): Promise<Array<{ key: string; target: number }>> {
  const r = await pool.query(`SELECT "periodKey" AS key, target FROM "GoalTarget" WHERE kind = $1 ORDER BY "periodKey"`, [kind])
  return r.rows.map((x) => ({ key: x.key, target: Number(x.target) }))
}

/** Target in effect for a period: explicit, else the most recent prior target, else scalar default. */
function resolveTarget(key: string, sorted: Array<{ key: string; target: number }>, fallback: number): number {
  let carried: number | null = null
  for (const t of sorted) {
    if (t.key === key) return t.target
    if (t.key < key) carried = t.target
    else break
  }
  return carried ?? fallback
}

const round500 = (v: number) => Math.max(500, Math.round(v / 500) * 500)

function buildBlock(
  kind: 'week' | 'month',
  rows: PeriodRow[],
  targets: Array<{ key: string; target: number }>,
  fallback: number,
  liveKey: string,
) {
  const periods = rows.map((p, i) => {
    const target = resolveTarget(p.key, targets, fallback)
    const isCurrent = i === rows.length - 1
    const pct = target > 0 ? Math.round((p.actual / target) * 100) : 0
    // ISO week key '2026-W28' → 'S28'; month '2026-07' → short label
    const label = kind === 'week'
      ? `S${p.key.slice(-2)}`
      : `${['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'aoû', 'sep', 'oct', 'nov', 'déc'][Number(p.key.slice(5, 7)) - 1]}`
    return { key: p.key, label, start: p.start, target, actual: Math.round(p.actual), orders: p.orders, pct, achieved: p.actual >= target, current: isCurrent, live: p.key === liveKey }
  })

  const current = periods[periods.length - 1]
  const completed = periods.slice(0, -1)

  // Streak: consecutive achieved counting back from the last completed period.
  let streak = 0
  for (let i = completed.length - 1; i >= 0; i--) { if (completed[i].achieved) streak++; else break }

  const hit = completed.filter((p) => p.achieved).length
  const hitRate = { hit, total: completed.length, pct: completed.length ? Math.round((hit / completed.length) * 100) : 0 }

  // Suggested next target: trailing 4 completed actuals + 10% growth, rounded to 500.
  const last4 = completed.slice(-4).map((p) => p.actual)
  const avg4 = last4.length ? last4.reduce((a, b) => a + b, 0) / last4.length : (current?.actual || fallback)
  const suggested = round500(avg4 * 1.1)

  // Projection for the in-progress current period (linear run-rate).
  let projection: { daysElapsed: number; daysTotal: number; projected: number; onPace: boolean; perDayNeeded: number } | null = null
  if (current?.live) {
    const start = new Date(current.start + 'T00:00:00Z')
    const nowLocal = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }))
    const today = new Date(Date.UTC(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate()))
    const daysTotal = kind === 'week' ? 7 : new Date(start.getUTCFullYear(), start.getUTCMonth() + 1, 0).getUTCDate()
    const elapsed = Math.min(daysTotal, Math.max(1, Math.round((today.getTime() - start.getTime()) / 86400000) + 1))
    const daysRemaining = Math.max(0, daysTotal - elapsed)
    const projected = Math.round((current.actual / elapsed) * daysTotal)
    const gap = Math.max(0, current.target - current.actual)
    projection = {
      daysElapsed: elapsed,
      daysTotal,
      projected,
      onPace: projected >= current.target,
      perDayNeeded: daysRemaining > 0 ? Math.round(gap / daysRemaining) : gap,
    }
  }

  return { periods, current, summary: { streak, hitRate, avgActual: Math.round(avg4), suggested }, projection }
}

export async function GET(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const requestedAnchor = req.nextUrl.searchParams.get('anchor')
    const anchor = requestedAnchor && /^\d{4}-\d{2}-\d{2}$/.test(requestedAnchor)
      ? requestedAnchor
      : businessToday()
    const [weekRows, monthRows, weekTargets, monthTargets, weekScalar, monthScalar, liveKeys] = await Promise.all([
      weekActuals(9, anchor), monthActuals(6, anchor), targetsFor('week'), targetsFor('month'),
      scalarGoal('weeklyGoal', DEFAULTS.week), scalarGoal('monthlyGoal', DEFAULTS.month),
      pool.query(`SELECT
        to_char(now() AT TIME ZONE '${TZ}', 'IYYY"-W"IW') AS week,
        to_char(now() AT TIME ZONE '${TZ}', 'YYYY-MM') AS month`),
    ])
    const live = liveKeys.rows[0]
    return NextResponse.json({
      anchor,
      week: buildBlock('week', weekRows, weekTargets, weekScalar, live.week),
      month: buildBlock('month', monthRows, monthTargets, monthScalar, live.month),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error'
    return NextResponse.json({ error: 'Failed', details: message }, { status: 500 })
  }
}

/**
 * PUT { kind: 'week'|'month', target, periodKey? } — set the target for a period
 * (defaults to the current one). Also updates the AppSetting scalar so the rest of
 * the dashboard and the carry-forward default stay in sync.
 */
export async function PUT(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const b = await req.json().catch(() => ({}))
    const kind = b.kind === 'month' ? 'month' : 'week'
    const target = Math.round(Number(b.target))
    if (!Number.isFinite(target) || target < 0) return NextResponse.json({ error: 'Objectif invalide' }, { status: 400 })

    // Default to the current period key in business time.
    let periodKey = typeof b.periodKey === 'string' ? b.periodKey : ''
    if (!periodKey) {
      const fmt = kind === 'week' ? `to_char(now() AT TIME ZONE '${TZ}', 'IYYY"-W"IW')` : `to_char(now() AT TIME ZONE '${TZ}', 'YYYY-MM')`
      const r = await pool.query(`SELECT ${fmt} AS k`)
      periodKey = r.rows[0].k
    }
    const validKey = kind === 'week' ? /^\d{4}-W\d{2}$/.test(periodKey) : /^\d{4}-\d{2}$/.test(periodKey)
    if (!validKey) return NextResponse.json({ error: 'Période invalide' }, { status: 400 })

    await pool.query(
      `INSERT INTO "GoalTarget" (kind, "periodKey", target) VALUES ($1, $2, $3)
       ON CONFLICT (kind, "periodKey") DO UPDATE SET target = EXCLUDED.target, "updatedAt" = NOW()`,
      [kind, periodKey, target]
    )
    // A historical edit must not silently replace today's global target.
    const currentKeySql = kind === 'week'
      ? `to_char(now() AT TIME ZONE '${TZ}', 'IYYY"-W"IW')`
      : `to_char(now() AT TIME ZONE '${TZ}', 'YYYY-MM')`
    const currentKey = (await pool.query(`SELECT ${currentKeySql} AS key`)).rows[0].key
    if (periodKey === currentKey) {
      await pool.query(
        `INSERT INTO "AppSetting" (key, value, "updatedAt") VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
        [kind === 'week' ? 'weeklyGoal' : 'monthlyGoal', String(target)]
      )
    }
    return NextResponse.json({ ok: true, kind, periodKey, target })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error'
    return NextResponse.json({ error: 'Failed', details: message }, { status: 500 })
  }
}
